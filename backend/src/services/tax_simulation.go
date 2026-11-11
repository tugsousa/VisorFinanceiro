package services

import (
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/username/taxfolio/backend/src/models"
	"github.com/username/taxfolio/backend/src/tax"
	"github.com/username/taxfolio/backend/src/utils"
)

// simulatedSource marks the sale added by SimulateStockSale, so its matched lots can be told apart.
const simulatedSource = "__simulation__"

// ErrSimulationInput is returned when a simulation can't be done with the values given.
var ErrSimulationInput = errors.New("simulação inválida")

// SaleSimulationRequest is a sale to simulate. A PriceEUR of 0 means the current price.
type SaleSimulationRequest struct {
	ISIN       string
	Quantity   float64
	PriceEUR   float64
	Commission float64
}

// SimulatedLot is the part of one purchase lot the simulated sale would use, in FIFO order.
type SimulatedLot struct {
	BuyDate       string  `json:"buy_date"`
	BuySource     string  `json:"buy_source"`
	Quantity      float64 `json:"quantity"`
	CostEUR       float64 `json:"cost_eur"`
	SaleAmountEUR float64 `json:"sale_amount_eur"`
	Commission    float64 `json:"commission"`
	Gain          float64 `json:"gain"`
	DaysHeld      int     `json:"days_held"`
	ShortTerm     bool    `json:"short_term"`
	LongTermDate  string  `json:"long_term_date"`
}

// SaleSimulation is the result of a simulated sale.
type SaleSimulation struct {
	ISIN          string          `json:"isin"`
	ProductName   string          `json:"product_name"`
	HeldQuantity  float64         `json:"held_quantity"`
	Quantity      float64         `json:"quantity"`
	PriceEUR      float64         `json:"price_eur"`
	UsedCurrent   bool            `json:"used_current_price"`
	SaleDate      string          `json:"sale_date"`
	SaleAmountEUR float64         `json:"sale_amount_eur"`
	Commission    float64         `json:"commission"` // Sale and purchase commissions of the lots used
	Gain          float64         `json:"gain"`
	ShortTermGain float64         `json:"short_term_gain"`
	Lots          []SimulatedLot  `json:"lots"`
	YearBefore    tax.YearBalance `json:"year_before"`
	YearAfter     tax.YearBalance `json:"year_after"`
	MarginalTax   float64         `json:"marginal_tax"`
	NetProceeds   float64         `json:"net_proceeds"` // Sale amount minus the sale commission and the extra tax
	TaxRate       float64         `json:"tax_rate"`
}

// OpenLotView is a purchase lot still held, with what it would give if sold today.
type OpenLotView struct {
	BuyDate        string  `json:"buy_date"`
	Quantity       float64 `json:"quantity"`
	CostEUR        float64 `json:"cost_eur"`
	ValueEUR       float64 `json:"value_eur"`
	UnrealizedGain float64 `json:"unrealized_gain"`
	DaysHeld       int     `json:"days_held"`
	ShortTerm      bool    `json:"short_term"`
	LongTermDate   string  `json:"long_term_date"`
}

// PositionTaxView is a position with its unrealized result, lot by lot in FIFO order.
type PositionTaxView struct {
	ISIN            string  `json:"isin"`
	ProductName     string  `json:"product_name"`
	Quantity        float64 `json:"quantity"`
	CurrentPriceEUR float64 `json:"current_price_eur"`
	PriceStatus     string  `json:"price_status"`
	CostEUR         float64 `json:"cost_eur"`
	ValueEUR        float64 `json:"value_eur"`
	UnrealizedGain  float64 `json:"unrealized_gain"`
	// TaxEffectIfSoldAll is how much this year's tax would change if the whole position were sold
	// today (negative when a loss lowers it), leaving out the sale commission.
	TaxEffectIfSoldAll float64       `json:"tax_effect_if_sold_all"`
	Lots               []OpenLotView `json:"lots"`
}

// TaxYearStatus is the tax situation of a year so far, with the unrealized result of each position.
type TaxYearStatus struct {
	Balance   tax.YearBalance   `json:"balance"`
	Positions []PositionTaxView `json:"positions"`
	TaxRate   float64           `json:"tax_rate"`
}

// currentLotsByISIN returns the purchase lots held now, per ISIN, oldest first.
func (s *uploadServiceImpl) currentLotsByISIN(userID, portfolioID int64) (map[string][]models.PurchaseLot, error) {
	holdingsByYear, err := s.GetStockHoldings(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	latestYear := ""
	for year := range holdingsByYear {
		if latestYear == "" || year > latestYear {
			latestYear = year
		}
	}
	lots := map[string][]models.PurchaseLot{}
	for _, lot := range holdingsByYear[latestYear] {
		lots[lot.ISIN] = append(lots[lot.ISIN], lot)
	}
	for isin := range lots {
		sort.SliceStable(lots[isin], func(i, j int) bool {
			return utils.ParseDate(lots[isin][i].BuyDate).Before(utils.ParseDate(lots[isin][j].BuyDate))
		})
	}
	return lots, nil
}

func (s *uploadServiceImpl) currentPrices(userID, portfolioID int64) (map[string]models.HoldingWithValue, error) {
	holdings, err := s.GetCurrentHoldingsWithValue(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	byISIN := make(map[string]models.HoldingWithValue, len(holdings))
	for _, h := range holdings {
		byISIN[h.ISIN] = h
	}
	return byISIN, nil
}

func today() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

// SimulateStockSale works out what selling part of a position today would give: the FIFO lots it
// would use, the gain, and the extra tax for this year. It adds a sale to a copy of the transactions
// and runs the same FIFO as the real sales, so nothing is stored and no other report changes.
func (s *uploadServiceImpl) SimulateStockSale(userID, portfolioID int64, req SaleSimulationRequest) (*SaleSimulation, error) {
	batch, err := s.simulateStockSales(userID, portfolioID, []SaleSimulationRequest{req})
	if err != nil {
		return nil, err
	}
	return &batch.Sales[0], nil
}

// salesSimulation is the result of simulating several sales made together today.
type salesSimulation struct {
	// Sales has each sale in the order asked. Its YearAfter, MarginalTax and NetProceeds are those of that
	// sale made alone.
	Sales []SaleSimulation
	// YearBefore is the year's balance without the sales and YearAfter with all of them; MarginalTax is the
	// extra tax of all of them together. It isn't the sum of each sale's: the tax is on the year's balance,
	// which doesn't go below zero, so a sale at a loss lowers the tax of another at a gain.
	YearBefore  tax.YearBalance
	YearAfter   tax.YearBalance
	MarginalTax float64
}

// simulateStockSales simulates selling several positions today, one sale per ISIN: it adds the sales to a
// copy of the transactions and runs the same FIFO as the real sales once. Nothing is stored and no cached
// report changes. With no sales it returns the year's balance as it is.
func (s *uploadServiceImpl) simulateStockSales(userID, portfolioID int64, requests []SaleSimulationRequest) (*salesSimulation, error) {
	seen := map[string]bool{}
	for _, req := range requests {
		if req.ISIN == "" || req.Quantity <= 0 || req.PriceEUR < 0 || req.Commission < 0 {
			return nil, fmt.Errorf("%w: indica o ISIN e uma quantidade maior que zero", ErrSimulationInput)
		}
		if seen[req.ISIN] {
			return nil, fmt.Errorf("%w: mais do que uma venda de %s", ErrSimulationInput, req.ISIN)
		}
		seen[req.ISIN] = true
	}

	lotsByISIN, err := s.currentLotsByISIN(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	var prices map[string]models.HoldingWithValue
	saleDate := today()
	saleDateText := saleDate.Format(utils.DefaultDateFormat)

	batch := &salesSimulation{Sales: make([]SaleSimulation, len(requests))}
	simulated := make([]models.ProcessedTransaction, 0, len(requests))
	for i, req := range requests {
		lots := lotsByISIN[req.ISIN]
		held := 0.0
		for _, lot := range lots {
			held += lot.Quantity
		}
		if held <= utils.QuantityEpsilon {
			return nil, fmt.Errorf("%w: não tens posição em %s", ErrSimulationInput, req.ISIN)
		}
		if req.Quantity > held+utils.QuantityEpsilon {
			return nil, fmt.Errorf("%w: só tens %v unidades", ErrSimulationInput, utils.RoundQuantity(held))
		}

		price := req.PriceEUR
		usedCurrent := false
		if price == 0 {
			if prices == nil {
				if prices, err = s.currentPrices(userID, portfolioID); err != nil {
					return nil, err
				}
			}
			h, ok := prices[req.ISIN]
			if !ok || h.CurrentPriceEUR <= 0 {
				return nil, fmt.Errorf("%w: não há preço atual para %s; indica um preço", ErrSimulationInput, req.ISIN)
			}
			price = h.CurrentPriceEUR
			usedCurrent = true
		}

		saleAmount := utils.RoundFloat(price*req.Quantity, 2)
		productName := lots[0].ProductName
		simulated = append(simulated, models.ProcessedTransaction{
			Date:             saleDateText,
			Source:           simulatedSource,
			ProductName:      productName,
			ISIN:             req.ISIN,
			Quantity:         req.Quantity,
			OriginalQuantity: req.Quantity,
			Price:            price,
			TransactionType:  "STOCK",
			BuySell:          "SELL",
			Amount:           saleAmount,
			Currency:         "EUR",
			Commission:       req.Commission,
			// Sorts after the real sales of the same day. Each sale is its own order: the rows of one order
			// share its commission.
			OrderID:      "~simulation-" + req.ISIN,
			ExchangeRate: 1,
			AmountEUR:    saleAmount,
		})
		batch.Sales[i] = SaleSimulation{
			ISIN:          req.ISIN,
			ProductName:   productName,
			HeldQuantity:  utils.RoundQuantity(held),
			Quantity:      req.Quantity,
			PriceEUR:      price,
			UsedCurrent:   usedCurrent,
			SaleDate:      saleDateText,
			SaleAmountEUR: saleAmount,
			Lots:          []SimulatedLot{},
			TaxRate:       tax.AutonomousRate,
		}
	}

	realSales, err := s.GetStockSaleDetails(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	optionSales, err := s.GetOptionSaleDetails(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	batch.YearBefore = tax.BalanceForYear(realSales, optionSales, saleDate.Year())
	batch.YearAfter = batch.YearBefore
	if len(requests) == 0 {
		return batch, nil
	}

	transactions, err := fetchUserProcessedTransactions(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	withSales := make([]models.ProcessedTransaction, len(transactions), len(transactions)+len(simulated))
	copy(withSales, transactions)
	withSales = append(withSales, simulated...)
	salesWithSimulation, _ := s.stockProcessor.Process(withSales)

	index := make(map[string]int, len(requests))
	for i, req := range requests {
		index[req.ISIN] = i
	}
	for _, sale := range salesWithSimulation {
		if sale.SaleSource != simulatedSource {
			continue
		}
		i, ok := index[sale.ISIN]
		if !ok {
			continue
		}
		result := &batch.Sales[i]
		buyDate := utils.ParseDate(sale.BuyDate)
		gain := tax.StockSaleGain(sale)
		lot := SimulatedLot{
			BuyDate:       sale.BuyDate,
			BuySource:     sale.BuySource,
			Quantity:      sale.Quantity,
			CostEUR:       -sale.BuyAmountEUR,
			SaleAmountEUR: sale.SaleAmountEUR,
			Commission:    sale.Commission,
			Gain:          gain,
			DaysHeld:      tax.DaysHeld(buyDate, saleDate),
			ShortTerm:     tax.IsShortTerm(buyDate, saleDate),
			LongTermDate:  tax.LongTermDate(buyDate).Format(utils.DefaultDateFormat),
		}
		result.Lots = append(result.Lots, lot)
		result.Commission += sale.Commission
		result.Gain += gain
		if lot.ShortTerm {
			result.ShortTermGain += gain
		}
	}

	batch.YearAfter = tax.BalanceForYear(salesWithSimulation, optionSales, saleDate.Year())
	batch.MarginalTax = tax.MarginalTax(batch.YearBefore.Balance, batch.YearAfter.Balance-batch.YearBefore.Balance)
	for i := range batch.Sales {
		result := &batch.Sales[i]
		result.Commission = utils.RoundFloat(result.Commission, 2)
		result.Gain = utils.RoundFloat(result.Gain, 2)
		result.ShortTermGain = utils.RoundFloat(result.ShortTermGain, 2)

		// The year with this sale alone: the real sales plus only this simulated one.
		result.YearBefore = batch.YearBefore
		result.YearAfter = batch.YearAfter
		if len(requests) > 1 {
			alone := make([]models.SaleDetail, 0, len(salesWithSimulation))
			for _, sale := range salesWithSimulation {
				if sale.SaleSource != simulatedSource || sale.ISIN == result.ISIN {
					alone = append(alone, sale)
				}
			}
			result.YearAfter = tax.BalanceForYear(alone, optionSales, saleDate.Year())
		}
		result.MarginalTax = tax.MarginalTax(result.YearBefore.Balance, result.YearAfter.Balance-result.YearBefore.Balance)
		result.NetProceeds = utils.RoundFloat(result.SaleAmountEUR-requests[i].Commission-result.MarginalTax, 2)
	}
	return batch, nil
}

// GetTaxYearStatus returns the capital gains balance of the current year so far, and for each
// position what it would give if sold today, lot by lot.
func (s *uploadServiceImpl) GetTaxYearStatus(userID, portfolioID int64) (*TaxYearStatus, error) {
	stockSales, err := s.GetStockSaleDetails(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	optionSales, err := s.GetOptionSaleDetails(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	lotsByISIN, err := s.currentLotsByISIN(userID, portfolioID)
	if err != nil {
		return nil, err
	}
	prices, err := s.currentPrices(userID, portfolioID)
	if err != nil {
		return nil, err
	}

	now := today()
	status := &TaxYearStatus{
		Balance:   tax.BalanceForYear(stockSales, optionSales, now.Year()),
		Positions: []PositionTaxView{},
		TaxRate:   tax.AutonomousRate,
	}

	for isin, lots := range lotsByISIN {
		if isin == "" || len(lots) == 0 {
			continue
		}
		h := prices[isin]
		position := PositionTaxView{
			ISIN:            isin,
			ProductName:     lots[0].ProductName,
			CurrentPriceEUR: h.CurrentPriceEUR,
			PriceStatus:     h.Status,
			Lots:            []OpenLotView{},
		}
		if h.ProductName != "" {
			position.ProductName = h.ProductName
		}
		for _, lot := range lots {
			buyDate := utils.ParseDate(lot.BuyDate)
			cost := -lot.BuyAmountEUR
			value := utils.RoundFloat(lot.Quantity*h.CurrentPriceEUR, 2)
			view := OpenLotView{
				BuyDate:      lot.BuyDate,
				Quantity:     lot.Quantity,
				CostEUR:      utils.RoundFloat(cost, 2),
				DaysHeld:     tax.DaysHeld(buyDate, now),
				ShortTerm:    tax.IsShortTerm(buyDate, now),
				LongTermDate: tax.LongTermDate(buyDate).Format(utils.DefaultDateFormat),
			}
			if h.CurrentPriceEUR > 0 {
				view.ValueEUR = value
				view.UnrealizedGain = utils.RoundFloat(value-cost, 2)
			}
			position.Lots = append(position.Lots, view)
			position.Quantity += lot.Quantity
			position.CostEUR += cost
			position.ValueEUR += view.ValueEUR
		}
		position.Quantity = utils.RoundQuantity(position.Quantity)
		position.CostEUR = utils.RoundFloat(position.CostEUR, 2)
		position.ValueEUR = utils.RoundFloat(position.ValueEUR, 2)
		if h.CurrentPriceEUR > 0 {
			position.UnrealizedGain = utils.RoundFloat(position.ValueEUR-position.CostEUR, 2)
			position.TaxEffectIfSoldAll = tax.MarginalTax(status.Balance.Balance, position.UnrealizedGain)
		}
		status.Positions = append(status.Positions, position)
	}

	sort.Slice(status.Positions, func(i, j int) bool {
		return status.Positions[i].UnrealizedGain < status.Positions[j].UnrealizedGain
	})
	return status, nil
}
