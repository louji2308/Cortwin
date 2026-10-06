PYTHON ?= python
NPM ?= npm
WEB_DIR := web

.DEFAULT_GOAL := help

.PHONY: help data reproduce export test web build serve preview lint

help:
	@echo "CorTwin make targets:"
	@echo "  make data       fetch + checksum the dataset (owner: B0-2)"
	@echo "  make reproduce  retrain + validate -> results.json, model.json, fixtures (owner: B0-2)"
	@echo "  make export     export the runtime model bundle (owner: B0-2)"
	@echo "  make test       pytest + vitest"
	@echo "  make web        vite dev server"
	@echo "  make build      production web build -> web/dist"
	@echo "  make serve      serve the production build (alias: preview)"
	@echo "  make lint       ruff check ."
	@echo "Windows: use .\\make.ps1 <target> (decision D-03, make is not installed locally)"

data:
	@if [ ! -f pipeline/fetch_data.py ]; then \
		echo "ERROR: 'make data' is not implemented yet (owner: B0-2): missing pipeline/fetch_data.py"; \
		exit 1; \
	fi
	$(PYTHON) pipeline/fetch_data.py

reproduce:
	@if [ ! -f pipeline/reproduce.py ]; then \
		echo "ERROR: 'make reproduce' is not implemented yet (owner: B0-2): missing pipeline/reproduce.py"; \
		exit 1; \
	fi
	$(PYTHON) -m pipeline.reproduce

export:
	@if [ ! -f pipeline/export_model.py ]; then \
		echo "ERROR: 'make export' is not implemented yet (owner: B0-2): missing pipeline/export_model.py"; \
		exit 1; \
	fi
	$(PYTHON) pipeline/export_model.py

test:
	$(PYTHON) -m pytest -q
	cd $(WEB_DIR) && $(NPM) run test

web:
	cd $(WEB_DIR) && $(NPM) run dev

build:
	cd $(WEB_DIR) && $(NPM) run build

serve: preview

preview:
	cd $(WEB_DIR) && $(NPM) run preview

lint:
	@command -v ruff >/dev/null 2>&1 || { echo "ERROR: ruff not found - install with 'pip install -r requirements.txt' (lint toolchain owner: B0-1)"; exit 1; }
	ruff check .
