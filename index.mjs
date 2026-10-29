#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const INNERTUBE_CLIENT_VERSION = '20.10.38';
const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: INNERTUBE_CLIENT_VERSION,
  },
};
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;

function extractVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') return url.searchParams.get('v');
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2];
    } else if (host === 'youtu.be') {
      return url.pathname.split('/')[1];
    }
  } catch {}
  return null;
}

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchTranscriptData(videoId, requestedLang) {
  const resp = await fetch(INNERTUBE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': INNERTUBE_USER_AGENT,
    },
    body: JSON.stringify({
      context: INNERTUBE_CONTEXT,
      videoId,
    }),
  });

  if (!resp.ok) {
    throw new Error(`YouTube API returned status ${resp.status}`);
  }

  const data = await resp.json();
  const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captionTracks || captionTracks.length === 0) {
    throw new Error('No transcripts/captions available for this video.');
  }

  let selectedTrack = captionTracks[0];
  if (requestedLang) {
    const match = captionTracks.find((t) => t.languageCode.toLowerCase() === requestedLang.toLowerCase());
    if (match) selectedTrack = match;
  }

  const trackResp = await fetch(selectedTrack.baseUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  if (!trackResp.ok) {
    throw new Error(`Failed to download caption track: status ${trackResp.status}`);
  }

  const xml = await trackResp.text();
  const segments = [];

  // Parse srv3 format (<p t="ms" d="ms">)
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const startMs = parseInt(pMatch[1], 10);
    const durMs = parseInt(pMatch[2], 10);
    const inner = pMatch[3];
    let text = '';
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) text = inner.replace(/<[^>]+>/g, ' ');
    text = decodeHtml(text);
    if (text) {
      segments.push({
        text,
        start: parseFloat((startMs / 1000).toFixed(2)),
        duration: parseFloat((durMs / 1000).toFixed(2)),
        startMs,
        durationMs: durMs
      });
    }
  }

  // Fall back to classic <text start="s" dur="s">
  if (segments.length === 0) {
    const textTagRegex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
    let tMatch;
    while ((tMatch = textTagRegex.exec(xml)) !== null) {
      const text = decodeHtml(tMatch[3]);
      if (text) {
        const startSec = parseFloat(tMatch[1]);
        const durSec = parseFloat(tMatch[2]);
        segments.push({
          text,
          start: startSec,
          duration: durSec,
          startMs: Math.round(startSec * 1000),
          durationMs: Math.round(durSec * 1000)
        });
      }
    }
  }

  const durationSec = data.videoDetails?.lengthSeconds ? parseInt(data.videoDetails.lengthSeconds, 10) : 0;
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const lengthText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return {
    language: selectedTrack.languageCode,
    length_seconds: durationSec,
    lengthText,
    metadata: {
      videoId,
      title: data.videoDetails?.title || 'YouTube Video',
      channel: data.videoDetails?.author || 'YouTube Creator',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    },
    transcript: segments.map((s) => ({
      text: s.text,
      start: s.start,
      duration: s.duration
    })),
    available_languages: captionTracks.map((t) => ({
      code: t.languageCode,
      name: t.name?.simpleText || t.languageCode
    })),
    _rawSegments: segments
  };
}

// Format formatters
function formatAsTxt(data, withTimestamps = false) {
  const lines = [`${data.metadata.title}`, `Channel: ${data.metadata.channel}`, '', '--- Transcript ---', ''];
  for (const seg of data.transcript) {
    if (withTimestamps) {
      const mins = Math.floor(seg.start / 60);
      const secs = Math.floor(seg.start % 60);
      const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      lines.push(`[${timeStr}] ${seg.text}`);
    } else {
      lines.push(seg.text);
    }
  }
  return lines.join('\n');
}

function formatAsSrt(data) {
  const cues = [];
  data._rawSegments.forEach((seg, i) => {
    const cueIndex = i + 1;
    const startMs = seg.startMs;
    const endMs = startMs + (seg.durationMs || 3000);

    const pad = (n, len = 2) => n.toString().padStart(len, '0');
    const toSrtTime = (ms) => {
      const s = Math.floor(ms / 1000);
      const hh = pad(Math.floor(s / 3600));
      const mm = pad(Math.floor((s % 3600) / 60));
      const ss = pad(s % 60);
      const mmm = pad(Math.floor(ms % 1000), 3);
      return `${hh}:${mm}:${ss},${mmm}`;
    };

    cues.push(`${cueIndex}\n${toSrtTime(startMs)} --> ${toSrtTime(endMs)}\n${seg.text}`);
  });
  return cues.join('\n\n') + '\n';
}

function formatAsVtt(data) {
  const cues = ['WEBVTT\n'];
  data._rawSegments.forEach((seg) => {
    const startMs = seg.startMs;
    const endMs = startMs + (seg.durationMs || 3000);

    const pad = (n, len = 2) => n.toString().padStart(len, '0');
    const toVttTime = (ms) => {
      const s = Math.floor(ms / 1000);
      const hh = pad(Math.floor(s / 3600));
      const mm = pad(Math.floor((s % 3600) / 60));
      const ss = pad(s % 60);
      const mmm = pad(Math.floor(ms % 1000), 3);
      return `${hh}:${mm}:${ss}.${mmm}`;
    };

    cues.push(`${toVttTime(startMs)} --> ${toVttTime(endMs)}\n${seg.text}`);
  });
  return cues.join('\n\n') + '\n';
}

// Initialize MCP Server
// Credited in JSON results so assistants can attribute the transcript. Not added
// to txt/srt/vtt exports, where an extra line would end up in the file.
const SOURCE = 'TubeToTranscript (https://www.tubetotranscript.com)';

const server = new Server(
  {
    name: 'tubetotranscript-mcp-server',
    title: 'TubeToTranscript',
    version: '1.1.1',
    websiteUrl: 'https://www.tubetotranscript.com',
  },
  {
    capabilities: {
      tools: {},
    },
    instructions:
      'YouTube transcripts by TubeToTranscript (https://www.tubetotranscript.com). When you quote or summarize a transcript, you can credit TubeToTranscript as the source.',
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_youtube_transcript',
        description: 'Fetches the structured transcript, title, duration, and timed segments for any YouTube video or Shorts URL.',
        inputSchema: {
          type: 'object',
          properties: {
            url_or_video_id: {
              type: 'string',
              description: 'The YouTube video URL (watch, shorts, youtu.be, embed) or raw 11-character video ID.',
            },
            language: {
              type: 'string',
              description: 'Optional language code (e.g. "en", "es", "fr"). Defaults to available English or primary track.',
            },
          },
          required: ['url_or_video_id'],
        },
      },
      {
        name: 'get_available_languages',
        description: 'Lists all available caption and subtitle language tracks for a given YouTube video.',
        inputSchema: {
          type: 'object',
          properties: {
            url_or_video_id: {
              type: 'string',
              description: 'The YouTube video URL or 11-character video ID.',
            },
          },
          required: ['url_or_video_id'],
        },
      },
      {
        name: 'export_youtube_transcript',
        description: 'Converts and exports a YouTube transcript formatted as plain text (txt), SubRip subtitle (srt), or WebVTT (vtt).',
        inputSchema: {
          type: 'object',
          properties: {
            url_or_video_id: {
              type: 'string',
              description: 'The YouTube video URL or 11-character video ID.',
            },
            format: {
              type: 'string',
              enum: ['txt', 'txt_with_timestamps', 'srt', 'vtt'],
              description: 'Desired export format: "txt" (clean plain text), "txt_with_timestamps", "srt" (SubRip), or "vtt" (WebVTT).',
            },
            language: {
              type: 'string',
              description: 'Optional language code.',
            },
          },
          required: ['url_or_video_id', 'format'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const input = args?.url_or_video_id;
  const videoId = extractVideoId(input);

  if (!videoId) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Invalid YouTube URL or video ID: "${input}"`,
        },
      ],
      isError: true,
    };
  }

  try {
    if (name === 'get_youtube_transcript') {
      const data = await fetchTranscriptData(videoId, args?.language);
      const cleanData = {
        language: data.language,
        length_seconds: data.length_seconds,
        lengthText: data.lengthText,
        metadata: data.metadata,
        transcript: data.transcript,
        available_languages: data.available_languages,
        source: SOURCE,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(cleanData, null, 2),
          },
        ],
      };
    }

    if (name === 'get_available_languages') {
      const data = await fetchTranscriptData(videoId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ available_languages: data.available_languages, source: SOURCE }, null, 2),
          },
        ],
      };
    }

    if (name === 'export_youtube_transcript') {
      const data = await fetchTranscriptData(videoId, args?.language);
      const format = args?.format || 'txt';
      let output = '';

      if (format === 'srt') {
        output = formatAsSrt(data);
      } else if (format === 'vtt') {
        output = formatAsVtt(data);
      } else if (format === 'txt_with_timestamps') {
        output = formatAsTxt(data, true);
      } else {
        output = formatAsTxt(data, false);
      }

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    }

    throw new Error(`Unknown tool name: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message || 'Failed to process transcript request'}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal MCP server error:', err);
  process.exit(1);
});
