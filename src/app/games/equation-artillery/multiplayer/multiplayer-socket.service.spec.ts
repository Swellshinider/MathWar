import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Socket } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTIPLAYER_CONFIG } from './multiplayer-config';
import { MultiplayerSocketService } from './multiplayer-socket.service';

const { socket, socketHandlers } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: never[]) => void>();
  return {
    socketHandlers: handlers,
    socket: {
      on: vi.fn((event: string, handler: (...args: never[]) => void) => {
        handlers.set(event, handler);
      }),
      disconnect: vi.fn(),
    } as unknown as Socket,
  };
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socket),
}));

describe('MultiplayerSocketService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    socketHandlers.clear();
    TestBed.configureTestingModule({
      providers: [
        MultiplayerSocketService,
        { provide: NgZone, useValue: { run: (callback: () => void) => callback() } },
        { provide: MULTIPLAYER_CONFIG, useValue: { serverUrl: 'http://localhost:3000' } },
      ],
    });
  });

  it('maps raw websocket connection errors to friendly reconnect copy', () => {
    const service = TestBed.inject(MultiplayerSocketService);
    const error = vi.fn();

    service.connect('token', { state: vi.fn(), error });
    socketHandlers.get('connect_error')?.(new Error('websocket error') as never);

    expect(error).toHaveBeenCalledWith('Connection interrupted. Trying to reconnect...');
  });
});
