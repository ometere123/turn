/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NIMIQ_NETWORK?: 'MainAlbatross' | 'TestAlbatross'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  nimiqPay?: {
    readonly language?: string
  }
}
