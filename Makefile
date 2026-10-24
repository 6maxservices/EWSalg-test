PYTHON ?= python

.PHONY: test test-js test-python verify gateway sanitize evidence drill

test: test-js test-python

test-js:
	npm test

test-python:
	$(PYTHON) -m unittest discover -s tests/python -p "test_*.py"

verify: test
	npm run verify

gateway:
	$(PYTHON) -m security_gateway

sanitize:
	@echo "Usage: python -m tools.sanitize_report INPUT OUTPUT"

evidence:
	$(PYTHON) -m tools.evidence verify

drill:
	$(PYTHON) -m tools.drill --record-evidence
