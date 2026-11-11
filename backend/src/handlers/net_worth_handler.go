package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/username/taxfolio/backend/src/logger"
	"github.com/username/taxfolio/backend/src/services"
	"github.com/username/taxfolio/backend/src/utils"
)

// NetWorthHandler serves the other assets (savings outside the brokers) and the total net worth. Every
// operation works only on the assets of the signed-in user: they belong to the user, not to a portfolio.
type NetWorthHandler struct {
	service services.NetWorthService
}

func NewNetWorthHandler(service services.NetWorthService) *NetWorthHandler {
	return &NetWorthHandler{service: service}
}

const maxNetWorthBodyBytes = 64 << 10

// HandleGetNetWorth answers GET /api/net-worth.
func (h *NetWorthHandler) HandleGetNetWorth(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	result, err := h.service.GetNetWorth(userID)
	if err != nil {
		h.sendError(w, err, "Erro ao calcular o património")
		return
	}
	sendNetWorthJSON(w, http.StatusOK, result)
}

// HandleListOtherAssets answers GET /api/other-assets.
func (h *NetWorthHandler) HandleListOtherAssets(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	assets, err := h.service.ListOtherAssets(userID)
	if err != nil {
		h.sendError(w, err, "Erro ao ler os ativos")
		return
	}
	sendNetWorthJSON(w, http.StatusOK, assets)
}

// HandleCreateOtherAsset answers POST /api/other-assets.
func (h *NetWorthHandler) HandleCreateOtherAsset(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	var in services.OtherAssetInput
	if !decodeNetWorthBody(w, r, &in) {
		return
	}
	asset, err := h.service.CreateOtherAsset(userID, in)
	if err != nil {
		h.sendError(w, err, "Erro ao criar o ativo")
		return
	}
	sendNetWorthJSON(w, http.StatusCreated, asset)
}

// HandleUpdateOtherAsset answers PUT /api/other-assets/{id}.
func (h *NetWorthHandler) HandleUpdateOtherAsset(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	assetID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in services.OtherAssetInput
	if !decodeNetWorthBody(w, r, &in) {
		return
	}
	asset, err := h.service.UpdateOtherAsset(userID, assetID, in)
	if err != nil {
		h.sendError(w, err, "Erro ao atualizar o ativo")
		return
	}
	sendNetWorthJSON(w, http.StatusOK, asset)
}

// HandleDeleteOtherAsset answers DELETE /api/other-assets/{id}.
func (h *NetWorthHandler) HandleDeleteOtherAsset(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	assetID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	if err := h.service.DeleteOtherAsset(userID, assetID); err != nil {
		h.sendError(w, err, "Erro ao apagar o ativo")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleAddOtherAssetEntry answers POST /api/other-assets/{id}/entries.
func (h *NetWorthHandler) HandleAddOtherAssetEntry(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	assetID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var in services.OtherAssetEntryInput
	if !decodeNetWorthBody(w, r, &in) {
		return
	}
	entry, err := h.service.AddOtherAssetEntry(userID, assetID, in)
	if err != nil {
		h.sendError(w, err, "Erro ao adicionar o movimento")
		return
	}
	sendNetWorthJSON(w, http.StatusCreated, entry)
}

// HandleDeleteOtherAssetEntry answers DELETE /api/other-assets/{id}/entries/{entryId}.
func (h *NetWorthHandler) HandleDeleteOtherAssetEntry(w http.ResponseWriter, r *http.Request) {
	userID, ok := GetUserIDFromContext(r.Context())
	if !ok {
		utils.SendJSONError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	assetID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	entryID, ok := pathID(w, r, "entryId")
	if !ok {
		return
	}
	if err := h.service.DeleteOtherAssetEntry(userID, assetID, entryID); err != nil {
		h.sendError(w, err, "Erro ao apagar o movimento")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// sendError answers 404 for an asset that isn't the user's, 400 with the message for invalid input, and 500
// with a generic message otherwise.
func (h *NetWorthHandler) sendError(w http.ResponseWriter, err error, message string) {
	switch {
	case errors.Is(err, services.ErrOtherAssetNotFound):
		utils.SendJSONError(w, services.ErrOtherAssetNotFound.Error(), http.StatusNotFound)
	case errors.Is(err, services.ErrOtherAssetInput):
		utils.SendJSONError(w, err.Error(), http.StatusBadRequest)
	default:
		logger.L.Error(message, "error", err)
		utils.SendJSONError(w, message, http.StatusInternalServerError)
	}
}

func pathID(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, name), 10, 64)
	if err != nil || id <= 0 {
		utils.SendJSONError(w, "invalid "+name, http.StatusBadRequest)
		return 0, false
	}
	return id, true
}

func decodeNetWorthBody(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxNetWorthBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		utils.SendJSONError(w, "Pedido inválido", http.StatusBadRequest)
		return false
	}
	return true
}

func sendNetWorthJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}
