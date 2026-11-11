// The launcher ("Abrir VisorFinanceiro.exe" in the project folder) is what to double-click to use the
// app on this PC. It rebuilds dist\VisorFinanceiro.exe when the code changed since the last build,
// installing what the build needs first, and then starts it. When nothing changed, it just starts it.
package main

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const appName = "VisorFinanceiro.exe"

// createNewConsole gives the app its own window, so this one can close.
const createNewConsole = 0x00000010

func main() {
	if err := run(); err != nil {
		fmt.Println()
		fmt.Println("Error:", err)
		fmt.Println()
		fmt.Print("Press Enter to close.")
		bufio.NewReader(os.Stdin).ReadString('\n')
		os.Exit(1)
	}
}

func run() error {
	root, err := projectRoot()
	if err != nil {
		return err
	}
	app := filepath.Join(root, "dist", appName)

	reason, err := rebuildReason(root, app)
	if err != nil {
		return err
	}
	if reason != "" {
		fmt.Println("VisorFinanceiro needs to be rebuilt:", reason)
		if err := rebuild(root, app); err != nil {
			return err
		}
	}

	fmt.Println("Starting VisorFinanceiro...")
	cmd := exec.Command(app)
	cmd.Dir = filepath.Dir(app)
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNewConsole}
	return cmd.Start()
}

// projectRoot is the folder of the launcher, which is the project folder.
func projectRoot() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	root := filepath.Dir(exe)
	if _, err := os.Stat(filepath.Join(root, "build-desktop.bat")); err != nil {
		return "", fmt.Errorf("the launcher must be in the VisorFinanceiro project folder (no build-desktop.bat in %s)", root)
	}
	return root, nil
}

// rebuildReason says why the app must be rebuilt, or returns "" when it's up to date: when a file it's
// built from is newer than it.
func rebuildReason(root, app string) (string, error) {
	info, err := os.Stat(app)
	if err != nil {
		return "it hasn't been built yet", nil
	}
	built := info.ModTime()

	inputs := []struct {
		dir  string
		skip []string // folders that aren't build inputs
	}{
		{filepath.Join(root, "frontend"), []string{"node_modules", "build", "dist"}},
		{filepath.Join(root, "backend"), []string{"desktop_web", "build"}},
	}
	for _, in := range inputs {
		changed, err := newerFile(in.dir, in.skip, built)
		if err != nil {
			return "", err
		}
		if changed != "" {
			rel, _ := filepath.Rel(root, changed)
			return rel + " changed", nil
		}
	}
	if info, err := os.Stat(filepath.Join(root, "build-desktop.bat")); err == nil && info.ModTime().After(built) {
		return "build-desktop.bat changed", nil
	}
	return "", nil
}

// newerFile returns a file under dir modified after t, skipping files that don't affect the build.
func newerFile(dir string, skipDirs []string, t time.Time) (string, error) {
	var found string
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		name := d.Name()
		if d.IsDir() {
			if path != dir && (strings.HasPrefix(name, ".") || contains(skipDirs, name)) {
				return filepath.SkipDir
			}
			return nil
		}
		if ignoredFile(name) {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.ModTime().After(t) {
			found = path
			return fs.SkipAll
		}
		return nil
	})
	return found, err
}

// ignoredFile is a file that changes without changing the app: data, logs, tests and local settings.
func ignoredFile(name string) bool {
	lower := strings.ToLower(name)
	for _, suffix := range []string{".db", ".db-shm", ".db-wal", ".sqlite", ".sqlite3", ".log", "_test.go", ".test.js", ".test.jsx", ".md"} {
		if strings.HasSuffix(lower, suffix) {
			return true
		}
	}
	return strings.HasPrefix(lower, ".env")
}

func contains(list []string, s string) bool {
	for _, item := range list {
		if strings.EqualFold(item, s) {
			return true
		}
	}
	return false
}

func rebuild(root, app string) error {
	// Without Go or Node.js, the setup installs them and builds the app.
	if !hasCommand("go") || !hasCommand("npm") {
		fmt.Println("Go or Node.js isn't installed; running the setup to install them...")
		if err := stopApp(); err != nil {
			return err
		}
		return runVisible(root, "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
			"-File", filepath.Join(root, "setup.ps1"), "-SkipClaude", "-SkipLauncher")
	}

	frontend := filepath.Join(root, "frontend")
	if npmInstallNeeded(frontend) {
		fmt.Println()
		fmt.Println("==> Installing the frontend packages")
		if err := runVisible(frontend, "cmd.exe", "/c", "npm install"); err != nil {
			return fmt.Errorf("npm install failed: %w", err)
		}
	}

	// A running copy (the app, or the MCP server Claude starts) locks the file. Claude starts the
	// MCP server again when it needs it.
	if err := stopApp(); err != nil {
		return err
	}

	fmt.Println()
	fmt.Println("==> Building dist\\" + appName)
	if err := runVisible(root, "cmd.exe", "/c", filepath.Join(root, "build-desktop.bat")); err != nil {
		return fmt.Errorf("the build failed; see the messages above")
	}
	if _, err := os.Stat(app); err != nil {
		return fmt.Errorf("the build didn't produce %s", app)
	}
	fmt.Println()
	return nil
}

// npmInstallNeeded is true when the packages aren't installed, or package.json or package-lock.json
// changed since they were (npm writes node_modules\.package-lock.json on each install).
func npmInstallNeeded(frontend string) bool {
	installed, err := os.Stat(filepath.Join(frontend, "node_modules", ".package-lock.json"))
	if err != nil {
		return true
	}
	for _, name := range []string{"package.json", "package-lock.json"} {
		if info, err := os.Stat(filepath.Join(frontend, name)); err == nil && info.ModTime().After(installed.ModTime()) {
			return true
		}
	}
	return false
}

func hasCommand(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func runVisible(dir, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	return cmd.Run()
}

// stopApp closes every running VisorFinanceiro.exe and waits until they've exited.
func stopApp() error {
	if !appRunning() {
		return nil
	}
	fmt.Println("Closing the running VisorFinanceiro so it can be replaced...")
	exec.Command("taskkill", "/F", "/IM", appName).Run()
	for i := 0; i < 20; i++ {
		if !appRunning() {
			time.Sleep(500 * time.Millisecond) // let Windows release the file
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return errors.New("VisorFinanceiro is still running; close it and try again")
}

func appRunning() bool {
	out, err := exec.Command("tasklist", "/FI", "IMAGENAME eq "+appName, "/NH").Output()
	return err == nil && strings.Contains(strings.ToLower(string(out)), strings.ToLower(appName))
}
