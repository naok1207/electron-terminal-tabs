# 改善タスク一覧

このドキュメントは、コードレビューで特定された改善点を管理するものです。

## 優先度: 高

### 1. コード品質改善
#### 1.1 マジックナンバーの定数化
```typescript
// 現状: マジックナンバーが散在
setTimeout(() => { ... }, 100);
setTimeout(() => { ... }, 50);

// 改善案: 定数として定義
const CONSTANTS = {
  TAB_SWITCH_DELAY: 100,
  RESIZE_DEBOUNCE_DELAY: 50,
  DISPOSE_DELAY: 100,
  TERMINAL_FOCUS_DELAY: 50
};
```

#### 1.2 タブ数制限の実装
```typescript
// terminal-manager.ts
createTab(): string {
  if (this.terminals.size >= 10) {
    console.warn('Maximum tab limit reached');
    this.sendToRenderer('tab:error', 'Maximum tab limit (10) reached');
    return null;
  }
  // 既存の処理...
}
```

## 優先度: 中

### 2. テスト実装
#### 2.1 単体テスト（Jest）
- `TerminalManager`クラスのテスト
- `TabManager`クラスのテスト
- IPC通信のモックテスト

#### 2.2 E2Eテスト（Playwright）
- タブの作成・切り替え・削除フロー
- エラーケースのテスト
- パフォーマンステスト

### 3. エラー通知機能
#### 3.1 トースト通知の実装
```typescript
// renderer側
interface Notification {
  type: 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

class NotificationManager {
  show(notification: Notification): void;
}
```

#### 3.2 エラーイベントの追加
- `tab:error`イベントの実装
- ユーザーフレンドリーなエラーメッセージ

### 4. キーボードショートカット
```typescript
// 実装予定のショートカット
const shortcuts = {
  'Cmd+T': 'new-tab',
  'Cmd+W': 'close-tab',
  'Cmd+1-9': 'switch-to-tab-n',
  'Cmd+Tab': 'next-tab',
  'Cmd+Shift+Tab': 'previous-tab'
};
```

## 優先度: 低

### 5. UI/UX改善
#### 5.1 タブのドラッグ&ドロップ
- Sortable.jsなどのライブラリを使用
- タブの並び替え状態を保持

#### 5.2 タブの名前変更
- ダブルクリックで編集モード
- Enterキーで確定、Escキーでキャンセル

### 6. セッション復元
#### 6.1 タブ状態の永続化
```typescript
interface TabState {
  id: string;
  name: string;
  cwd: string;
  active: boolean;
  order: number;
}

// localStorage or electron-store に保存
```

#### 6.2 起動時の復元オプション
- 設定で有効/無効を切り替え
- 前回の状態を復元するか確認ダイアログ

### 7. パフォーマンス監視
#### 7.1 メモリ使用量の追跡
```typescript
// 開発環境でのメモリプロファイリング
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    console.log('Memory Usage:', process.memoryUsage());
  }, 30000);
}
```

#### 7.2 パフォーマンスメトリクス
- タブ作成時間の計測
- レンダリング性能の監視

## 実装スケジュール（案）

1. **Phase 1** (1-2週間)
   - コード品質改善
   - エラー通知機能

2. **Phase 2** (2-3週間)
   - テスト実装
   - キーボードショートカット

3. **Phase 3** (2-3週間)
   - UI/UX改善
   - セッション復元

4. **Phase 4** (1週間)
   - パフォーマンス監視
   - 最終調整

## 技術選定

- **テストフレームワーク**: Jest + @testing-library/react
- **E2Eテスト**: Playwright
- **状態管理**: electron-store
- **UI ライブラリ**: 
  - トースト通知: react-hot-toast
  - ドラッグ&ドロップ: @dnd-kit/sortable

## 注意事項

- 各改善は独立したPRとして実装
- 既存機能への影響を最小限に抑える
- パフォーマンスへの影響を常に考慮
- ユーザビリティテストを実施