package parsers

import (
	"TAXFOLIO/src/models"
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"time"
)

func ParseCSV(file io.Reader) ([]models.RawTransaction, error) {
	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1 // Allow variable number of fields per record

	var transactions []models.RawTransaction
	var currentRecord []string

	// Read the header row and ignore it
	_, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV header: %w", err)
	}

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("Warning: Failed to read CSV record: %v", err)
			continue // Skip this record and continue processing
		}

		// If the record starts with a date, it's a new transaction
		if isNewTransaction(record) {
			// If there's a currentRecord being built, parse it as a transaction
			if len(currentRecord) > 0 {
				transaction, err := parseTransaction(currentRecord)
				if err != nil {
					log.Printf("Warning: Failed to parse transaction: %v", err)
				} else {
					transactions = append(transactions, transaction)
				}
			}

			// Start a new currentRecord
			currentRecord = record
		} else {
			// Append this record to the currentRecord (handles line breaks)
			for i, field := range record {
				if field != "" {
					if len(currentRecord) <= i {
						currentRecord = append(currentRecord, field)
					} else if currentRecord[i] == "" {
						currentRecord[i] = field
					} else {
						currentRecord[i] += field
					}
				}
			}
		}
	}

	// Parse the last transaction
	if len(currentRecord) > 0 {
		transaction, err := parseTransaction(currentRecord)
		if err != nil {
			log.Printf("Warning: Failed to parse transaction: %v", err)
		} else {
			transactions = append(transactions, transaction)
		}
	}

	return transactions, nil
}

// isNewTransaction checks if a record starts with a date (indicating a new transaction).
func isNewTransaction(record []string) bool {
	if len(record) == 0 {
		return false
	}
	// Check if the first field is a date in "dd-mm-yyyy" format
	_, err := time.Parse("02-01-2006", record[0])
	return err == nil
}

// parseTransaction converts a CSV record into a Transaction struct.
func parseTransaction(record []string) (models.RawTransaction, error) {
	if len(record) < 12 {
		return models.RawTransaction{}, fmt.Errorf(
			"invalid record length: expected 12 fields, got %d. Record: %v",
			len(record),
			record,
		)
	}

	return models.RawTransaction{
		OrderDate:    record[0],  // "data_ordem" (as string)
		OrderTime:    record[1],  // "hora"
		ValueDate:    record[2],  // "data_valor" (as string)
		Name:         record[3],  // "descritivo"
		ISIN:         record[4],  // "isin"
		Description:  record[5],  // "tipo_transacao"
		ExchangeRate: record[6],  // "taxa_cambio"
		Currency:     record[7],  // "moeda_cambio"
		Amount:       record[8],  // "montante_transacao"
		OrderID:      record[11], // "id_ordem"
	}, nil
}
