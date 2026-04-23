/**
 * WebSocket 服务
 * 
 * 用于实时接收解析进度推送
 */

import { API_BASE_URL } from './config';

// WebSocket 基础 URL
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

/**
 * 解析进度 WebSocket 客户端
 */
export class ParseProgressWebSocket {
  constructor(options = {}) {
    this.userId = options.userId || null;
    this.documentId = options.documentId || null;
    this.onProgress = options.onProgress || (() => {});
    this.onConnect = options.onConnect || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    this.onError = options.onError || (() => {});
    
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.heartbeatInterval = null;
    this.shouldReconnect = true;
  }
  
  /**
   * 构建 WebSocket URL
   */
  buildUrl() {
    const params = new URLSearchParams();
    
    if (this.userId) {
      params.append('user_id', this.userId);
    }
    if (this.documentId) {
      params.append('document_id', this.documentId);
    }
    
    const queryString = params.toString();
    return `${WS_BASE_URL}/api/v1/ws/parse-progress${queryString ? '?' + queryString : ''}`;
  }
  
  /**
   * 连接 WebSocket
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }
    
    const url = this.buildUrl();
    console.log('[WS] Connecting to:', url);
    
    this.ws = new WebSocket(url);
    
    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.onConnect();
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 处理不同类型的消息
        switch (data.type) {
          case 'connected':
            console.log('[WS] Server acknowledged:', data.message);
            break;
            
          case 'pong':
          case 'heartbeat':
            // 心跳响应，忽略
            break;
            
          case 'error':
            console.warn('[WS] Server error:', data.message);
            this.onError(data);
            break;
            
          default:
            // 进度更新
            if (data.document_id || data.task_id) {
              this.onProgress(data);
            }
        }
      } catch (e) {
        console.error('[WS] Failed to parse message:', e);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('[WS] Error:', error);
      this.onError(error);
    };
    
    this.ws.onclose = (event) => {
      console.log('[WS] Disconnected:', event.code, event.reason);
      this.stopHeartbeat();
      this.onDisconnect();
      
      // 尝试重连
      if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`[WS] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connect(), this.reconnectDelay);
      }
    };
  }
  
  /**
   * 断开连接
   */
  disconnect() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  /**
   * 发送消息
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  /**
   * 查询文档进度
   */
  queryProgress(documentId) {
    this.send({
      type: 'query_progress',
      document_id: documentId
    });
  }
  
  /**
   * 开始心跳
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000); // 每30秒发送一次心跳
  }
  
  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  /**
   * 更新订阅的文档 ID
   */
  setDocumentId(documentId) {
    this.documentId = documentId;
    // 如果已连接，需要重新连接以更新订阅
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect();
      this.shouldReconnect = true;
      this.connect();
    }
  }
}

/**
 * 创建解析进度 WebSocket 实例
 */
export function createParseProgressWS(options) {
  return new ParseProgressWebSocket(options);
}

/**
 * HTTP 轮询备用方案
 * 
 * 当 WebSocket 不可用时使用
 */
export async function pollParseProgress(documentId) {
  const response = await fetch(`${API_BASE_URL}/api/v1/parse-progress/document/${documentId}`);
  const data = await response.json();
  
  if (data.success) {
    return data.data;
  }
  
  return null;
}

export default {
  ParseProgressWebSocket,
  createParseProgressWS,
  pollParseProgress
};

