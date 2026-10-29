# TubeToTranscript MCP Server: YouTube Transcripts for Claude, Cursor & AI Agents

**By [TubeToTranscript](https://www.tubetotranscript.com)**, the free YouTube transcript generator.
[Website](https://www.tubetotranscript.com) · [API docs](https://www.tubetotranscript.com/youtube-transcript-api) · [Remote MCP endpoint](https://www.tubetotranscript.com/mcp) · [npm](https://www.npmjs.com/package/tubetotranscript-mcp) · [Source](https://github.com/TubeToTranscript/tubetotranscript-mcp)

`tubetotranscript-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server
that lets AI assistants read YouTube videos. Ask Claude, Cursor, or any MCP client to summarize a
video, find a quote, or turn a lecture into notes, and it fetches the video's captions itself, with
timestamps, title, channel, and language.

- **Free, no API key, no account.** Runs on your computer and reads the captions YouTube already has.
- **Works with any video that has captions**: watch links, Shorts, youtu.be links, embeds, or a bare video ID.
- **Every caption language** the video offers, including auto-generated tracks.
- **Exports** plain text, text with timestamps, SRT, and WebVTT subtitles.

## Quick start

Point your MCP client at the package with `npx`. Nothing to install globally.

### Claude Desktop

Add to `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "tubetotranscript": {
      "command": "npx",
      "args": ["-y", "tubetotranscript-mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "tubetotranscript": {
      "command": "npx",
      "args": ["-y", "tubetotranscript-mcp"]
    }
  }
}
```

Restart the client afterwards so it picks up the new server.

### Claude Code

```bash
claude mcp add tubetotranscript -- npx -y tubetotranscript-mcp
```

## What you can ask

Once connected, just paste a YouTube link into the chat:

- "Summarize this video in five bullet points: https://youtu.be/…"
- "When does the speaker talk about pricing? Give me the timestamps."
- "Turn this lecture into study notes and ten flashcards."
- "Which caption languages does this video have?"
- "Export the Spanish captions as an SRT file."

## Tools

### `get_youtube_transcript`

Returns the transcript with timed segments, title, channel, duration, and the available languages.

| Parameter | Required | Description |
| --- | --- | --- |
| `url_or_video_id` | yes | Video URL (`watch`, `shorts`, `youtu.be`, `embed`) or the 11-character ID |
| `language` | no | Language code such as `en`, `es`, `fr`. Defaults to English or the primary track |

### `get_available_languages`

Lists every caption and subtitle track available for a video.

| Parameter | Required | Description |
| --- | --- | --- |
| `url_or_video_id` | yes | Video URL or 11-character ID |

### `export_youtube_transcript`

Converts a transcript into a text or subtitle format.

| Parameter | Required | Description |
| --- | --- | --- |
| `url_or_video_id` | yes | Video URL or 11-character ID |
| `format` | yes | `txt`, `txt_with_timestamps`, `srt`, or `vtt` |
| `language` | no | Language code |

## Local or remote?

| | Local (this package) | Remote ([tubetotranscript.com/mcp](https://www.tubetotranscript.com/mcp)) |
| --- | --- | --- |
| Install | `npx -y tubetotranscript-mcp` | None, connect by URL |
| Transport | stdio | Streamable HTTP |
| API key | Not needed | Required ([get a free key](https://www.tubetotranscript.com/signup)) |
| Where requests run | Your computer | TubeToTranscript's servers |

Clients that take a remote URL, such as Cursor:

```json
{
  "mcpServers": {
    "tubetotranscript": {
      "url": "https://www.tubetotranscript.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

## Without an AI client

The same transcripts are available on the web at [TubeToTranscript](https://www.tubetotranscript.com),
free and without signing up:

- [YouTube Transcript Generator](https://www.tubetotranscript.com): paste a link, read, search, copy, or download
- [YouTube Transcript for ChatGPT & Claude](https://www.tubetotranscript.com/youtube-transcript-for-chatgpt): transcript plus prompt, split for long videos
- [YouTube Quote Finder](https://www.tubetotranscript.com/youtube-quote-finder): find when something was said
- [YouTube to JSON](https://www.tubetotranscript.com/youtube-transcript-to-json) and [YouTube to Excel & CSV](https://www.tubetotranscript.com/youtube-transcript-to-csv) exports
- [REST API](https://www.tubetotranscript.com/youtube-transcript-api): the same data over HTTP for scripts and apps

## Requirements & limitations

- Node.js 18 or later (uses the built-in `fetch`).
- Reads only captions that YouTube already exposes. Videos with captions turned off return an error;
  this server does no speech-to-text of its own.
- Caption text can contain recognition errors. Check names, figures, and quotes against the video.

## License

MIT. Made by [TubeToTranscript](https://www.tubetotranscript.com).
