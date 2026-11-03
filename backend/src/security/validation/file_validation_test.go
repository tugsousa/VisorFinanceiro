package validation

import (
	"bytes"
	"strings"
	"testing"

	"github.com/username/taxfolio/backend/src/logger"
)

func TestValidateFileContent_MultiByteCharacterAtSampleBoundary(t *testing.T) {
	logger.InitLogger("error")

	// Every position of a 2, 3 and 4-byte character around the end of the 1024-byte sample.
	for _, character := range []string{"ã", "€", "😀"} {
		for padding := 1024 - len(character); padding <= 1024; padding++ {
			content := strings.Repeat("a", padding) + character + ",rest\n"
			if _, err := ValidateFileContentByMagicBytes(bytes.NewReader([]byte(content))); err != nil {
				t.Errorf("%q after %d bytes was rejected: %v", character, padding, err)
			}
		}
	}
}

func TestValidateFileContent_RejectsInvalidContent(t *testing.T) {
	logger.InitLogger("error")

	tests := []struct {
		name    string
		content []byte
	}{
		{"invalid UTF-8 inside the sample", append([]byte("abc\xff"), bytes.Repeat([]byte("a"), 2000)...)},
		{"invalid UTF-8 at the end of the sample", append(bytes.Repeat([]byte("a"), 1023), '\xff', 'a')},
		{"null byte", []byte("abc\x00def")},
		{"short file ending in a partial character", []byte("abc\xc3")},
		{"XML doctype", []byte(`<?xml version="1.0"?><!DOCTYPE foo>`)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := ValidateFileContentByMagicBytes(bytes.NewReader(tt.content)); err == nil {
				t.Error("expected the file to be rejected")
			}
		})
	}
}
