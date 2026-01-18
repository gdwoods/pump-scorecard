#!/bin/bash
# Script to create a feature branch for watchlist functionality
# This creates a restore point before making the watchlist changes

set -e  # Exit on error

echo "📋 Creating feature branch for watchlist functionality..."
echo ""

# Determine the main branch (main or master)
if git show-ref --verify --quiet refs/heads/main; then
    MAIN_BRANCH="main"
elif git show-ref --verify --quiet refs/heads/master; then
    MAIN_BRANCH="master"
else
    echo "❌ Error: Could not find 'main' or 'master' branch"
    exit 1
fi

echo "✓ Found main branch: $MAIN_BRANCH"
echo ""

# Check current status
echo "📊 Current Git status:"
git status --short
echo ""

# Check if we're on main/master (compatible with older Git versions)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" = "$MAIN_BRANCH" ]; then
    echo "✓ Currently on $MAIN_BRANCH branch"
else
    echo "⚠️  Currently on '$CURRENT_BRANCH' branch"
    read -p "Switch to $MAIN_BRANCH first? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git checkout $MAIN_BRANCH
        CURRENT_BRANCH=$MAIN_BRANCH
    fi
fi
echo ""

# Pull latest changes from remote
echo "⬇️  Pulling latest changes from origin/$MAIN_BRANCH..."
git pull origin $MAIN_BRANCH || echo "⚠️  Could not pull (remote may not exist or no network)"
echo ""

# Create feature branch
FEATURE_BRANCH="feature/watchlist-functionality"
echo "🌿 Creating feature branch: $FEATURE_BRANCH"
git checkout -b $FEATURE_BRANCH
echo ""

# Show branch info
echo "✅ Feature branch created successfully!"
echo ""
echo "Current branch: $(git rev-parse --abbrev-ref HEAD)"
echo ""
echo "📝 Next steps:"
echo "1. Stage your watchlist changes: git add ."
echo "2. Commit: git commit -m 'Add watchlist functionality with anonymous user tracking'"
echo "3. Push branch: git push -u origin $FEATURE_BRANCH"
echo ""
echo "To merge later: git checkout $MAIN_BRANCH && git merge $FEATURE_BRANCH"
echo "To discard: git checkout $MAIN_BRANCH && git branch -D $FEATURE_BRANCH"
