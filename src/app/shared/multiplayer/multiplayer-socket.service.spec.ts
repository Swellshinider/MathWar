import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Socket } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplayerAuthService } from './multiplayer-auth.service';
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
  const auth = {
    clearInvalidSession: vi.fn(),
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    socketHandlers.clear();
    TestBed.configureTestingModule({
      providers: [
        MultiplayerSocketService,
        { provide: MultiplayerAuthService, useValue: auth },
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
    expect(auth.clearInvalidSession).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('clears invalid sessions when the backend rejects the access token', () => {
    const service = TestBed.inject(MultiplayerSocketService);
    const error = vi.fn();

    service.connect('token', { state: vi.fn(), error });
    socketHandlers.get('connect_error')?.(new Error('Invalid access token.') as never);

    expect(auth.clearInvalidSession).toHaveBeenCalledOnce();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('Your multiplayer session expired. Please enter again.');
  });

  it('clears invalid sessions when the backend requires authentication', () => {
    const service = TestBed.inject(MultiplayerSocketService);
    const error = vi.fn();

    service.connect('token', { state: vi.fn(), error });
    socketHandlers.get('connect_error')?.(new Error('Authentication required.') as never);

    expect(auth.clearInvalidSession).toHaveBeenCalledOnce();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('Your multiplayer session expired. Please enter again.');
  });

  it('handles Socket.IO authentication details without throwing', () => {
    const service = TestBed.inject(MultiplayerSocketService);
    const error = vi.fn();

    service.connect('token', { state: vi.fn(), error });
    socketHandlers.get('connect_error')?.(
      Object.assign(new Error('connect error'), { data: { message: 'Invalid access token.' } }) as
        never,
    );

    expect(auth.clearInvalidSession).toHaveBeenCalledOnce();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('Your multiplayer session expired. Please enter again.');
  });
});
