# 実装メモ

## タブ機能実装での学習事項

### 1. xterm.jsとの非同期処理の扱い

#### 問題
- ターミナルの破棄時に`handleResize`エラーが発生
- タブ削除のタイミングとリサイズイベントが競合

#### 解決策
```typescript
// disposedフラグで状態管理
interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLElement;
  resizeObserver?: ResizeObserver;
  webglAddon?: WebglAddon;
  disposed?: boolean;  // 追加
}

// リサイズ処理にデバウンシング
let resizeTimeout: NodeJS.Timeout | null = null;
const resizeObserver = new ResizeObserver(() => {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (!instance.disposed) {
      fitAddon.fit();
    }
  }, 50);
});
```

### 2. タブ切り替えのタイミング問題

#### 問題
- 新規タブ作成時、ターミナルインスタンスの作成前にswitchイベントが発生

#### 解決策
```typescript
// バックエンドでタブ作成後、遅延してから切り替え
createTab(): string {
  const tabId = this.createTerminal();
  this.sendToRenderer('tab:created', tabId, this.getTabs());
  
  // 100ms遅延してから切り替え
  setTimeout(() => {
    this.switchTab(tabId);
  }, 100);
  
  return tabId;
}
```

### 3. メモリリーク対策

#### 問題
- タブ削除時にアドオンやイベントリスナーが残る

#### 解決策
```typescript
// 段階的な破棄処理
private removeTab(tabId: string) {
  instance.disposed = true;
  instance.container.style.display = 'none';
  this.terminals.delete(tabId);
  
  if (instance.resizeObserver) {
    instance.resizeObserver.disconnect();
  }
  
  // 非同期処理の完了を待つ
  setTimeout(() => {
    // WebGLアドオン破棄
    if (instance.webglAddon) {
      instance.webglAddon.dispose();
    }
    
    setTimeout(() => {
      // Fitアドオン破棄
      if (instance.fitAddon) {
        instance.fitAddon.dispose();
      }
      
      setTimeout(() => {
        // ターミナル破棄
        instance.terminal.dispose();
        instance.container.remove();
        window.electronAPI.terminal.dispose(tabId);
      }, 50);
    }, 50);
  }, 100);
}
```

### 4. UI/UXの考慮事項

#### タブの選択状態
- クリック後すぐにUIが更新されない問題
- → `onTabSwitched`イベントでタブバーを再描画

#### フォーカス管理
- 新規タブ作成時の自動フォーカス
- → `requestAnimationFrame`で確実にDOM更新後にフォーカス

## 今後の実装で注意すべき点

### 1. 親子タブ間の通信
- タブIDをキーとした通信チャネルの確立
- メッセージのシリアライズ/デシリアライズ

### 2. Claude Code統合
- 子プロセスの管理（node-ptyとは別に）
- ストリーム出力の処理
- エラーのハンドリング

### 3. パフォーマンス
- 多数のタブを開いた際のメモリ使用量
- ターミナル出力のバッファリング
- 不要なレンダリングの抑制

## 参考になったリソース
- [xterm.js公式ドキュメント](https://xtermjs.org/)
- [VSCode Terminal実装](https://github.com/microsoft/vscode/tree/main/src/vs/workbench/contrib/terminal)
- [Electron IPC Best Practices](https://www.electronjs.org/docs/latest/tutorial/ipc)