#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Audit Service CLI Test Script
# ============================================================================
# Run audit-related tests from terminal with various options.
#
# Usage:
#   ./scripts/test-audit.sh              # Run all audit tests
#   ./scripts/test-audit.sh unit         # Run unit tests only
#   ./scripts/test-audit.sh v3           # Run V3 verification tests only
#   ./scripts/test-audit.sh integration  # Run integration tests only
#   ./scripts/test-audit.sh coverage     # Run with coverage report
#   ./scripts/test-audit.sh all          # Run all tests (full suite)
#   ./scripts/test-audit.sh watch        # Run in watch mode
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_header() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Change to project root
cd "$PROJECT_ROOT"

# Default mode
MODE="${1:-audit}"

case "$MODE" in
    unit)
        print_header "Running AuditService Unit Tests"
        pnpm test run services/AuditService/__tests__/AuditService.test.ts \
            services/CryptoService/__tests__/auditPackage.test.ts \
            services/CryptoService/__tests__/evaluateAuditRules.test.ts \
            --reporter=verbose
        ;;

    e2e)
        print_header "Running E2E Commitment Tests"
        pnpm test run services/AuditService/__tests__/e2e-commitment.test.ts --reporter=verbose
        ;;

    v3)
        print_header "Running V3 Verification Tests"
        pnpm test run services/AuditService/__tests__/verifyV3.test.ts --reporter=verbose
        ;;

    integration)
        print_header "Running Audit Integration Tests"
        pnpm test run services/CryptoService/__tests__/auditPackageGenerateVerify.test.ts \
            services/CryptoService/__tests__/auditPackageNegative.test.ts \
            --reporter=verbose
        ;;

    crypto)
        print_header "Running Crypto Service Tests"
        pnpm test run services/CryptoService/__tests__/ --reporter=verbose
        ;;

    coverage)
        print_header "Running Audit Tests with Coverage"
        pnpm test run \
            services/AuditService/__tests__/ \
            services/CryptoService/__tests__/auditPackage*.test.ts \
            services/CryptoService/__tests__/evaluateAuditRules.test.ts \
            --coverage --reporter=verbose
        ;;

    all)
        print_header "Running Full Test Suite"
        pnpm test run --reporter=verbose
        ;;

    watch)
        print_header "Running Audit Tests in Watch Mode"
        pnpm test \
            services/AuditService/__tests__/ \
            services/CryptoService/__tests__/auditPackage*.test.ts \
            --reporter=verbose
        ;;

    audit|*)
        print_header "Running All Audit-Related Tests"
        echo "Test files:"
        echo "  - AuditService.test.ts (V2.2 phase verification)"
        echo "  - verifyV3.test.ts (V3 3-step verification)"
        echo "  - e2e-commitment.test.ts (11-field commitment structure)"
        echo "  - auditPackage.test.ts (package creation)"
        echo "  - auditPackageGenerateVerify.test.ts (e2e flow)"
        echo "  - auditPackageNegative.test.ts (negative cases)"
        echo "  - evaluateAuditRules.test.ts (rules evaluation)"
        echo ""

        pnpm test run \
            services/AuditService/__tests__/AuditService.test.ts \
            services/AuditService/__tests__/verifyV3.test.ts \
            services/AuditService/__tests__/e2e-commitment.test.ts \
            services/CryptoService/__tests__/auditPackage.test.ts \
            services/CryptoService/__tests__/auditPackageGenerateVerify.test.ts \
            services/CryptoService/__tests__/auditPackageNegative.test.ts \
            services/CryptoService/__tests__/evaluateAuditRules.test.ts \
            --reporter=verbose
        ;;
esac

# Print summary
echo ""
if [ $? -eq 0 ]; then
    print_success "All tests passed!"
else
    print_error "Some tests failed. See output above for details."
    exit 1
fi
