package mcpserver

import (
	"context"
	"testing"

	"github.com/username/taxfolio/backend/src/services"
)

type netWorthStub struct {
	services.UploadService
	askedFor int64
}

func (s *netWorthStub) GetNetWorth(userID int64) (*services.NetWorth, error) {
	s.askedFor = userID
	return &services.NetWorth{TotalEUR: 123}, nil
}

func TestGetNetWorth_OnlyForTheServersUser(t *testing.T) {
	stub := &netWorthStub{}
	s := &Server{uploads: stub, userID: 7}
	_, out, err := s.getNetWorth(context.Background(), nil, struct{}{})
	if err != nil {
		t.Fatal(err)
	}
	if stub.askedFor != 7 {
		t.Errorf("asked for user %d, want 7", stub.askedFor)
	}
	result := out.(map[string]any)
	if result["net_worth"].(*services.NetWorth).TotalEUR != 123 || result["note"] == "" {
		t.Errorf("unexpected result %+v", result)
	}
}
