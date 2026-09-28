# Music-Library
A web application for organizing songs, creating playlists, and learning full-stack development.

Goals
Learn HTML, CSS, and JavaScript
Build a music management system
Learn Git and GitHub
Eventually add AI-powered recommendations

## Shared MP3s

Run `npm start` and open `http://localhost:3000`. In Discover, visitors can search the community MP3 collection by title or filename, upload MP3s, and download shared tracks. Uploads are limited to 25 MB per file and five files per IP address per hour; shared storage is capped at 1 GB by default. Set `SHARED_TRACKS_DIR` to choose the storage directory or `MAX_SHARED_STORAGE_BYTES` to change the storage cap.

Shared uploads are public and stored unencrypted on the server. Only upload audio you have permission to distribute. This feature searches tracks uploaded to this site; it does not download from YouTube or query an external catalog API. For a public deployment, use HTTPS and configure persistent storage and backups.
