interface MasterStorageBridge {
  getItem: () => string | null
  setItem: (serialized: string) => void
  removeItem: () => void
}

interface Window {
  masterStorage?: MasterStorageBridge
  masterV2?: {
    load(): Promise<import('../v2/core/types').Workspace>
    execute(request: import('../v2/core/types').CommitRequest): Promise<{ workspace: import('../v2/core/types').Workspace; receipt: import('../v2/core/types').Receipt }>
    undo(expectedRevision?: number): Promise<{ workspace: import('../v2/core/types').Workspace; receipt: import('../v2/core/types').Receipt }>
    export(): Promise<string>
    subscribe(callback: () => void): () => void
    getGatewayConfig(): Promise<{ url: string; token: string; envPath: string }>
    readLegacy(): Promise<string | null>
    openConfigFolder(): Promise<void>
  }
}
