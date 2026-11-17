#!/usr/bin/env node
// Entry lakar-mcp (stdio). Didaftarkan lewat .mcp.json project; LAKAR_URL menunjuk ke lakard.
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createLakarMcpServer } from './server.js';

const url = process.env.LAKAR_URL || 'http://127.0.0.1:7466';
const server = createLakarMcpServer(url);
await server.connect(new StdioServerTransport());
