#!/bin/bash
# Check Git status and help push to GitHub

set -e

echo "📋 Checking Git status..."
echo ""

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Current branch: $CURRENT_BRANCH"
echo ""

# Show uncommitted changes
echo "📊 Uncommitted changes:"
git status --short
echo ""

# Check if we need to commit changes
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  You have uncommitted changes."
    read -p "Stage and commit all changes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📝 Staging changes..."
        git add .
        
        echo "💾 Committing..."
        git commit -m "Fix watchlist error handling and suppress empty error objects"
        
        echo "✅ Changes committed"
        echo ""
    fi
fi

# Determine the branch to push
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "⚠️  You're on the $CURRENT_BRANCH branch."
    read -p "Push to $CURRENT_BRANCH? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🚀 Pushing to origin/$CURRENT_BRANCH..."
        git push origin $CURRENT_BRANCH
    else
        echo "❌ Aborted. Consider creating a feature branch first."
    fi
else
    echo "✅ You're on feature branch: $CURRENT_BRANCH"
    echo "🚀 Pushing to GitHub..."
    git push -u origin $CURRENT_BRANCH
    echo ""
    echo "✅ Pushed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "   - Create a Pull Request on GitHub to merge into main"
    echo "   - Or merge locally: git checkout main && git merge $CURRENT_BRANCH && git push origin main"
fi
