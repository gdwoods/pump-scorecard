#!/bin/bash
# Script to create a Git restore point (tag) before making major changes

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Creating restore point...${NC}"

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "Current branch: ${GREEN}${CURRENT_BRANCH}${NC}"

# Create a descriptive tag name with timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TAG_NAME="backup-before-feature-updates-${TIMESTAMP}"

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${BLUE}⚠️  Warning: You have uncommitted changes.${NC}"
    echo "Would you like to commit them first? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        git add -A
        git commit -m "Save state before feature updates"
    else
        echo "Creating tag anyway, but uncommitted changes won't be included."
    fi
fi

# Create the tag
echo -e "${BLUE}Creating tag: ${GREEN}${TAG_NAME}${NC}"
git tag -a "${TAG_NAME}" -m "Restore point before implementing: company profiles, underwriter analytics, advanced filters, pattern detection, and new today badge"

# Push the tag to remote
echo -e "${BLUE}Pushing tag to remote...${NC}"
git push origin "${TAG_NAME}"

echo -e "${GREEN}✓ Restore point created successfully!${NC}"
echo -e "${BLUE}Tag name: ${GREEN}${TAG_NAME}${NC}"
echo ""
echo "To restore to this point later, run:"
echo "  git checkout ${TAG_NAME}"
echo ""
echo "Or create a branch from this tag:"
echo "  git checkout -b restore-from-tag ${TAG_NAME}"
