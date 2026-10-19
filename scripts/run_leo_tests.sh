#!/usr/bin/env bash
set -euo pipefail

# Basic smoke runner for zk_invoice_v2.aleo transitions using inputs/* defaults.
# Replace placeholder addresses/fields in inputs/ before running.

echo "Running create_invoice..."
leo run create_invoice < inputs/create_invoice.in

echo "Running verify_invoice..."
leo run verify_invoice < inputs/verify_invoice.in

echo "Running pay_invoice..."
leo run pay_invoice < inputs/pay_invoice.in

echo "Running cancel_invoice..."
leo run cancel_invoice < inputs/cancel_invoice.in

echo "Done."
