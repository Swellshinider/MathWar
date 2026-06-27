import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Socket } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTIPLAYER_CONFIG } from './multiplayer-config';
import {
  MULTIPLAYER_SOCKET_FACTORY,
  MultiplayerSocketService,
} from './multiplayer-socket.service';

const socketHandlers = new Map<string, (...args: never[]) => void>();
const socket = {
  on: vi.fn((event: string, handler: (...args: never[]) => void) => {
    socketHandlers.set(event, handler);
  }),
  disconnect: vi.fn(),
} as unknown as Socket;

describe('MultiplayerSocketService', () => {
  const createSocket = vi.fn(() => socket);

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    socketHandlers.clear();
    TestBed.configureTestingModule({
      providers: [
        MultiplayerSocketService,
        { provide: NgZone, useValue: { run: (callback: () => void) => callback() } },
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
        { provide: MULTIPLAYER_SOCKET_FACTORY, useValue: createSocket },
      ],
    });
  });

  it('maps raw websocket connection errors to friendly reconnect copy', () => {
    const service = TestBed.inject(MultiplayerSocketService);
    const error = vi.fn();

    service.connect('token', { state: vi.fn(), error });
    socketHandlers.get('connect_error')?.(new Error('websocket error') as never);

    expect(createSocket).toHaveBeenCalledWith('http://localhost:3000', 'token');
    expect(error).toHaveBeenCalledWith('Connection interrupted. Trying to reconnect...');
  });
});
