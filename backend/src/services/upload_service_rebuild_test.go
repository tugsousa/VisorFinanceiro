package services

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/database"
)

func countSnapshots(t *testing.T) int {
	t.Helper()
	var count int
	if err := database.DB.QueryRow(`SELECT COUNT(*) FROM portfolio_snapshots`).Scan(&count); err != nil {
		t.Fatalf("failed to count snapshots: %v", err)
	}
	return count
}

// A failed rebuild used to leave the portfolio with no history, as the old snapshots were already gone.
func TestRebuild_FailureKeepsThePreviousHistory(t *testing.T) {
	setupHistoryTestDB(t)
	service := &uploadServiceImpl{priceService: historyPriceStub{}}

	insertDeposit(t, "01-01-2025", 1000)
	if err := service.RebuildUserHistory(1, 1); err != nil {
		t.Fatalf("first rebuild failed: %v", err)
	}
	before := countSnapshots(t)
	if before == 0 {
		t.Fatal("expected snapshots")
	}

	_, err := database.DB.Exec(`CREATE TRIGGER fail_insert BEFORE INSERT ON portfolio_snapshots
		BEGIN SELECT RAISE(ABORT, 'disk full'); END`)
	if err != nil {
		t.Fatalf("failed to create trigger: %v", err)
	}

	if err := service.RebuildUserHistory(1, 1); err == nil {
		t.Fatal("expected the rebuild to fail")
	}
	if after := countSnapshots(t); after != before {
		t.Errorf("expected %d snapshots to remain, got %d", before, after)
	}
}

// Overlapping rebuilds used to fail on the unique date of each other's snapshots.
func TestRebuild_OverlappingRebuildsOfAPortfolioAllSucceed(t *testing.T) {
	setupHistoryTestDB(t)
	service := &uploadServiceImpl{priceService: historyPriceStub{}}
	insertDeposit(t, "01-01-2025", 1000)

	var wg sync.WaitGroup
	errs := make([]error, 4)
	for i := range errs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs[i] = service.RebuildUserHistory(1, 1)
		}(i)
	}
	wg.Wait()

	for _, err := range errs {
		if err != nil {
			t.Errorf("rebuild failed: %v", err)
		}
	}
}

func TestRefreshDailySnapshot_RebuildsInTheBackground(t *testing.T) {
	setupHistoryTestDB(t)
	jobs := NewJobManager()
	defer jobs.Stop()
	service := &uploadServiceImpl{priceService: historyPriceStub{}, jobManager: jobs}
	insertDeposit(t, "01-01-2025", 1000)

	if err := service.RefreshDailySnapshot(1, 1); err != nil {
		t.Fatalf("RefreshDailySnapshot returned error: %v", err)
	}

	listed := jobs.ListJobs()
	if len(listed) != 1 || listed[0].Type != JobTypeRebuildHistory {
		t.Fatalf("expected a rebuild job, got %+v", listed)
	}

	// The dashboard reads this list to know when to fetch the chart again.
	encoded, err := json.Marshal(listed[0])
	if err != nil {
		t.Fatalf("a job must be readable by the API: %v", err)
	}
	var decoded struct {
		Payload struct {
			PortfolioID float64 `json:"portfolio_id"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(encoded, &decoded); err != nil || decoded.Payload.PortfolioID != 1 {
		t.Errorf("unexpected job JSON: %s (%v)", encoded, err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for jobs.HasUnfinishedRebuild(1, 1) {
		if time.Now().After(deadline) {
			t.Fatal("the rebuild didn't finish")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if countSnapshots(t) == 0 {
		t.Error("expected the job to create the snapshots")
	}
}

func TestHasUnfinishedRebuild_OnlyCountsThatPortfolio(t *testing.T) {
	jobs := &JobManager{queue: NewJobQueue(10, 0)}
	if _, err := jobs.queue.AddJob(JobTypeRebuildHistory, map[string]interface{}{"user_id": float64(1), "portfolio_id": float64(2)}); err != nil {
		t.Fatalf("AddJob returned error: %v", err)
	}

	if !jobs.HasUnfinishedRebuild(1, 2) {
		t.Error("expected a waiting rebuild to count")
	}
	if jobs.HasUnfinishedRebuild(1, 3) {
		t.Error("another portfolio's rebuild must not count")
	}
	if jobs.HasUnfinishedRebuild(9, 2) {
		t.Error("another user's rebuild must not count")
	}
}
