# Orange Elephant

A browser extension that lets you add personal annotations to Hacker News usernames. Annotations are synced across all browser instances where you're logged in.

## Features

- Add short annotations to any Hacker News username
- Annotations appear as badges next to usernames
- Click on a username to add or edit an annotation
- Automatic sync across browsers via browser sync storage
- Search, export, and import annotations via the popup
- Works on Chrome and Firefox

## Usage

### Adding an Annotation

1. Navigate to [Hacker News](https://news.ycombinator.com)
2. Click on any username
3. Enter your annotation in the tooltip that appears
4. Click "Save" or press Enter

### Editing an Annotation

1. Click on the badge next to a username
2. Modify the text in the popup
3. Click "Save" or press Enter

### Deleting an Annotation

1. Click on the badge next to a username
2. Click the "Delete" button

### Managing Annotations

Click the extension icon to open the popup where you can:

- View all your annotations
- Search annotations by username or text
- Export annotations as JSON
- Import annotations from JSON

## Syncing

Annotations are stored using the browser's sync storage API. As long as you're signed into your browser (Chrome account or Firefox account), annotations will automatically sync to all your browser instances.

**Storage limits:**
- Total: 100KB
- Per item: 8KB

This is sufficient for hundreds of short annotations.

## Privacy

- All annotations are stored in your browser's sync storage
- Annotations are only visible to you
