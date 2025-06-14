# Claude.md - Terminal Sample Project

## プロジェクト概要

このプロジェクトは、Electronベースのターミナルアプリケーションを、Claude Codeを活用した階層型開発支援システムに拡張することを目的としています。

### 現在の実装状態
- ✅ Electron + TypeScript環境
- ✅ xterm.js v5.3によるターミナルUI
- ✅ node-pty v1.0によるPTY制御
- ✅ WebGLレンダリング
- ✅ macOS対応（zsh/bash）
- ✅ 複数タブ機能（VSCodeライクなUI）
- ✅ タブごとの独立したターミナルセッション
- ✅ タブの作成・切り替え・削除機能

### 目標とする機能
親ワーカー（メインタブ）が複数の子ワーカー（子タブ）を管理し、それぞれでClaude AIエージェントを実行する階層型システムの構築。

## アーキテクチャ設計

### コア原則
1. **段階的実装**: 単純な親子通信から始めて機能を追加
2. **既存コード活用**: terminal-manager.tsを拡張
3. **Claude Code統合**: JSON出力形式を標準として使用
4. **分離環境**: git worktreeやDockerはClaude Code内で管理（システム側では考慮しない）

### システム構成
```
親ワーカー（タブ1）
├── 子ワーカー1（タブ2）- 独立したPTYプロセス
├── 子ワーカー2（タブ3）- 独立したPTYプロセス
└── 子ワーカー3（タブ4）- 独立したPTYプロセス
```

## 実装タスク概要

### フェーズ1: 基本的な親子通信 [優先度: 高] ✅ 一部完了
1. **タブ機能追加** - 複数ターミナルタブのサポート ✅ 完了
2. **親子関係定義** - タブのメタデータ管理 ✅ 完了
3. **コマンドルーティング** - 親から子へのコマンド送信（`@child1: command`形式） 🔲 未実装
4. **結果返送** - 子から親への構造化された結果通知 🔲 未実装
5. **Claude統合** - `claude -p "prompt" --output-format json`の実行と処理 🔲 未実装

### フェーズ2: 複数子ワーカー管理 [優先度: 高]
1. **動的タブ作成** - 親から子タブを動的に生成
2. **作業ディレクトリ分離** - 各子の独立した作業環境
3. **ワーカープール** - 効率的なタスク配分

### フェーズ3: タスク分割と並列実行 [優先度: 中]
1. **バッチコマンド** - 複数コマンドの一括実行
2. **実行モニタリング** - リアルタイム状態監視

### フェーズ4: コンテキスト共有 [優先度: 中]
1. **環境変数共有** - 親の環境変数を子に伝播
2. **結果の変数化** - 実行結果を変数として保存・参照

### フェーズ5: エラーハンドリング [優先度: 中]
1. **エラー検知** - 各種エラーの検知と分類
2. **自動リトライ** - 一時的エラーへの対応

### フェーズ6: リアルタイム進捗 [優先度: 低]
1. **ストリーミング** - Claude Codeのストリーム出力対応

### フェーズ7: 実行履歴 [優先度: 低]
1. **履歴記録** - SQLiteによる実行履歴の永続化

## 技術的決定事項

### Claude Code実行方式
```bash
# 基本実行（JSON出力）
claude -p "prompt" --output-format json

# ストリーミング実行
claude -p "prompt" --output-format stream-json

# 権限スキップ（自動化用）
claude -p "prompt" --output-format json --dangerously-skip-permissions
```

### コマンド構文
```bash
# 子ワーカーへのコマンド送信
@child1: ls -la

# 子タブ作成
@create-child: worker-name

# バッチ実行
@batch: ["cmd1", "cmd2", "cmd3"]

# 環境変数設定
@env: KEY=VALUE

# 結果の変数保存
@child1: command > $result1
```

### ファイル構造（追加予定）
```
src/
├── main/
│   ├── command-router.ts      # コマンドルーティング
│   ├── worker-pool.ts         # ワーカープール管理
│   ├── claude-integration.ts  # Claude Code統合
│   ├── output-capture.ts      # 出力キャプチャ
│   └── error-handler.ts       # エラー処理
├── renderer/
│   ├── tab-manager-ui.ts      # タブ管理UI
│   ├── execution-monitor.ts   # 実行モニター
│   └── progress-ui.ts         # 進捗表示
└── types/
    └── tab.ts                 # タブ型定義
```

## 制約事項

### リソース制限
- 最大同時Claude Codeインスタンス: 5
- ワーカープロセスメモリ: 512MB/プロセス
- スクロールバック: 5,000行
- タブ数上限: 10（親1 + 子9）

### Claude API制限
- レート制限: 50リクエスト/分（Tier 1）
- トークン制限: 200,000トークン/リクエスト
- リトライ: 指数バックオフ（最大60秒）

## 開発ガイドライン

### コーディング規約
1. TypeScriptの厳格な型定義を使用
2. エラーは必ず適切にハンドリング
3. 非同期処理はasync/awaitを使用
4. IPCは型安全なラッパーを通じて実行

### テスト方針
1. 各フェーズ完了時に統合テスト
2. エラーケースを必ずテスト
3. パフォーマンステストを実施

### Claude Code使用時の注意
1. このファイルを参照して全体像を把握
2. 実装時は既存コードのスタイルに従う
3. 小さな変更を積み重ねる
4. 各タスクの検証項目を必ず確認

## 参考リンク
- [詳細なタスクリスト](./docs/detailed-tasks.md) ※別途作成予定
- [既存実装のREADME](./README.md)
- [Electron公式ドキュメント](https://www.electronjs.org/)
- [xterm.js API](https://xtermjs.org/)

---

## 実装済み機能の詳細

### タブ管理システム (2025年1月実装)
- **TerminalManager拡張**: Map<string, ITerminalSession>による複数セッション管理
- **TabManagerクラス**: レンダラープロセスでの複数ターミナルインスタンス管理
- **IPC通信**: tab:create, tab:switch, tab:close, tab:getTabsハンドラー
- **UI実装**: VSCodeライクなタブバー（HTML/CSS）
- **エラー対策**: 
  - xterm.jsのhandleResizeエラー修正
  - WebGLアドオンの適切な破棄処理
  - ResizeObserverのデバウンシング
  - 非同期処理の競合を防ぐdisposedフラグ管理

---

最終更新: 2025年1月
次の実装: フェーズ1の残りタスク（コマンドルーティング、結果返送、Claude統合）
