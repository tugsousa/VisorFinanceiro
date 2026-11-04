package models

import (
	"fmt"
	"sort"
)

// FileError is a problem with an uploaded file that the user can fix, with a message written for them.
type FileError string

func (e FileError) Error() string {
	return string(e)
}

// maxSkippedRowMessages limits what is shown to the user about a file with many kinds of unknown rows.
const maxSkippedRowMessages = 20

// SkippedRows counts the rows of a file that weren't imported, by reason, so that the user can be told.
type SkippedRows struct {
	counts map[string]int
}

// Add records a row that wasn't imported.
func (s *SkippedRows) Add(reason string) {
	if s.counts == nil {
		s.counts = make(map[string]int)
	}
	s.counts[reason]++
}

// Messages describes the skipped rows, the most frequent reasons first.
func (s *SkippedRows) Messages() []string {
	reasons := make([]string, 0, len(s.counts))
	for reason := range s.counts {
		reasons = append(reasons, reason)
	}
	sort.Slice(reasons, func(i, j int) bool {
		if s.counts[reasons[i]] != s.counts[reasons[j]] {
			return s.counts[reasons[i]] > s.counts[reasons[j]]
		}
		return reasons[i] < reasons[j]
	})

	messages := make([]string, 0, len(reasons))
	for i, reason := range reasons {
		if i == maxSkippedRowMessages {
			messages = append(messages, fmt.Sprintf("... e mais %d tipos de linha", len(reasons)-i))
			break
		}
		messages = append(messages, fmt.Sprintf("%s (%d)", reason, s.counts[reason]))
	}
	return messages
}
