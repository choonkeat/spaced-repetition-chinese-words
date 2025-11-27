.PHONY: test test-headed test-ui server install install-browsers clean

# Default target
test: node_modules/.installed browsers/.installed
	@echo "Starting server and running tests..."
	@if lsof -i :8765 >/dev/null 2>&1; then \
		echo "Server already running on port 8765"; \
		npx playwright test; \
	else \
		echo "Starting server on port 8765..."; \
		python3 -m http.server 8765 & \
		SERVER_PID=$$!; \
		sleep 1; \
		npx playwright test; \
		TEST_EXIT=$$?; \
		kill $$SERVER_PID 2>/dev/null || true; \
		exit $$TEST_EXIT; \
	fi

# Run tests with browser visible
test-headed: node_modules/.installed browsers/.installed
	@if lsof -i :8765 >/dev/null 2>&1; then \
		npx playwright test --headed; \
	else \
		python3 -m http.server 8765 & \
		SERVER_PID=$$!; \
		sleep 1; \
		npx playwright test --headed; \
		TEST_EXIT=$$?; \
		kill $$SERVER_PID 2>/dev/null || true; \
		exit $$TEST_EXIT; \
	fi

# Run tests with Playwright UI
test-ui: node_modules/.installed browsers/.installed
	@if lsof -i :8765 >/dev/null 2>&1; then \
		npx playwright test --ui; \
	else \
		python3 -m http.server 8765 & \
		SERVER_PID=$$!; \
		sleep 1; \
		npx playwright test --ui; \
		TEST_EXIT=$$?; \
		kill $$SERVER_PID 2>/dev/null || true; \
		exit $$TEST_EXIT; \
	fi

# Start dev server (foreground)
server:
	python3 -m http.server 8765

# Install npm dependencies
node_modules/.installed: package.json
	npm install
	touch node_modules/.installed

# Install playwright browsers
browsers/.installed: node_modules/.installed
	npx playwright install chromium
	mkdir -p browsers
	touch browsers/.installed

# Convenience targets
install: node_modules/.installed

install-browsers: browsers/.installed

clean:
	rm -rf node_modules browsers
