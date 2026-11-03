package services

import (
	"testing"
	"time"

	"github.com/username/taxfolio/backend/src/logger"
)

// The queue fails unknown job types right away, which is enough to test how jobs flow through it.
const instantJobType = "instant_test_job"

func waitForJobsToFinish(t *testing.T, jq *JobQueue) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		jq.mu.RLock()
		unfinished := len(jq.pending) + len(jq.workers)
		jq.mu.RUnlock()
		if unfinished == 0 {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("jobs didn't finish in time")
}

func TestJobQueue_FinishedJobsDoNotFillTheQueue(t *testing.T) {
	logger.InitLogger("error")
	jq := NewJobQueue(5, 2)

	for i := 0; i < 50; i++ {
		if _, err := jq.AddJob(instantJobType, map[string]interface{}{}); err != nil {
			t.Fatalf("job %d was rejected: %v", i, err)
		}
		waitForJobsToFinish(t, jq)
	}
}

func TestJobQueue_RejectsWhenTooManyJobsAreUnfinished(t *testing.T) {
	logger.InitLogger("error")
	jq := NewJobQueue(2, 1)
	jq.pending = []*Job{{ID: "waiting-1"}, {ID: "waiting-2"}}

	if _, err := jq.AddJob(instantJobType, map[string]interface{}{}); err == nil {
		t.Error("expected the job to be rejected")
	}
}

func TestJobQueue_RunsJobsAddedWhileAllWorkersAreBusy(t *testing.T) {
	logger.InitLogger("error")
	jq := NewJobQueue(200, 1)

	var jobs []*Job
	for i := 0; i < 20; i++ {
		job, err := jq.AddJob(instantJobType, map[string]interface{}{})
		if err != nil {
			t.Fatalf("job %d was rejected: %v", i, err)
		}
		jobs = append(jobs, job)
	}
	waitForJobsToFinish(t, jq)

	jq.mu.RLock()
	defer jq.mu.RUnlock()
	if len(jq.jobs) != len(jobs) {
		t.Errorf("expected %d distinct jobs, got %d", len(jobs), len(jq.jobs))
	}
	for _, job := range jobs {
		if job.Status != JobStatusFailed {
			t.Errorf("job %s has status %s, expected it to have run", job.ID, job.Status)
		}
	}
}

func TestJobQueue_RemovesJobsAfterTheRetention(t *testing.T) {
	logger.InitLogger("error")
	jq := NewJobQueue(200, 1)

	job, err := jq.AddJob(instantJobType, map[string]interface{}{})
	if err != nil {
		t.Fatalf("AddJob returned error: %v", err)
	}
	waitForJobsToFinish(t, jq)

	jq.mu.Lock()
	jq.pruneFinishedJobs(time.Now().Add(finishedJobRetention - time.Minute))
	_, keptInsideRetention := jq.jobs[job.ID]
	jq.pruneFinishedJobs(time.Now().Add(finishedJobRetention + time.Minute))
	_, keptAfterRetention := jq.jobs[job.ID]
	jq.mu.Unlock()

	if !keptInsideRetention {
		t.Error("job was removed before the retention ended")
	}
	if keptAfterRetention {
		t.Error("job was kept after the retention ended")
	}
}
