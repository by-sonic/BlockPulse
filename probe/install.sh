#!/bin/bash
# BlockPulse probe — one-liner installer for Linux/macOS
# Usage: curl -sL https://blockpulse.ru/probe/install.sh | bash
set -e

API="__API_URL__"
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
DIM='\033[0;90m'
NC='\033[0m'

echo -e "${CYAN}⚡ BlockPulse Probe${NC}"
echo -e "${DIM}Checking your VPN protocol accessibility...${NC}"
echo ""

# Check Python
PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" &>/dev/null; then
    ver=$("$cmd" -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo "0")
    if [ "$ver" -ge 3 ]; then
      PYTHON="$cmd"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo -e "${RED}Python 3 not found.${NC}"
  echo ""
  if command -v apt-get &>/dev/null; then
    echo -e "Installing Python 3..."
    sudo apt-get update -qq && sudo apt-get install -y -qq python3 >/dev/null 2>&1
    PYTHON="python3"
  elif command -v brew &>/dev/null; then
    echo -e "Installing Python 3 via Homebrew..."
    brew install python3 >/dev/null 2>&1
    PYTHON="python3"
  elif command -v dnf &>/dev/null; then
    echo -e "Installing Python 3..."
    sudo dnf install -y python3 >/dev/null 2>&1
    PYTHON="python3"
  elif command -v pacman &>/dev/null; then
    echo -e "Installing Python 3..."
    sudo pacman -Sy --noconfirm python >/dev/null 2>&1
    PYTHON="python3"
  else
    echo -e "${RED}Cannot auto-install Python. Please install Python 3.8+ manually.${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Python installed${NC}"
fi

echo -e "${DIM}Using: $($PYTHON --version 2>&1)${NC}"
echo ""

# Download and run probe
TMPFILE=$(mktemp /tmp/bp-probe-XXXXX.py)
curl -sL "${API}/probe.py" -o "$TMPFILE"

if [ ! -s "$TMPFILE" ]; then
  echo -e "${RED}Failed to download probe script${NC}"
  rm -f "$TMPFILE"
  exit 1
fi

$PYTHON "$TMPFILE"
EXIT_CODE=$?
rm -f "$TMPFILE"

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✓ Probe complete! Results sent to BlockPulse.${NC}"
  echo -e "${DIM}Dashboard: ${API}${NC}"
else
  echo -e "${RED}Probe failed (exit code: $EXIT_CODE)${NC}"
fi
