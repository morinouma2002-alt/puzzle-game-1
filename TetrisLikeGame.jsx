import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pause, Play, RotateCw, RotateCcw, RefreshCw } from "lucide-react";

const COLS = 10;
const ROWS = 20;
const EMPTY = null;

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const COLORS = {
  I: "bg-cyan-400 border-cyan-200 shadow-cyan-500/40",
  O: "bg-yellow-400 border-yellow-200 shadow-yellow-500/40",
  T: "bg-purple-500 border-purple-300 shadow-purple-500/40",
  S: "bg-green-500 border-green-300 shadow-green-500/40",
  Z: "bg-red-500 border-red-300 shadow-red-500/40",
  J: "bg-blue-500 border-blue-300 shadow-blue-500/40",
  L: "bg-orange-500 border-orange-300 shadow-orange-500/40",
  GHOST: "bg-white/15 border-white/20 shadow-none",
};

const BAG = Object.keys(SHAPES);

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

function pickPiece() {
  const type = BAG[Math.floor(Math.random() * BAG.length)];
  return {
    type,
    shape: SHAPES[type].map((row) => [...row]),
    x: Math.floor(COLS / 2) - Math.ceil(SHAPES[type][0].length / 2),
    y: 0,
  };
}

function rotate(shape, dir = 1) {
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (dir > 0) rotated[x][rows - 1 - y] = shape[y][x];
      else rotated[cols - 1 - x][y] = shape[y][x];
    }
  }
  return rotated;
}

function collides(board, piece, offsetX = 0, offsetY = 0, shapeOverride = null) {
  const shape = shapeOverride || piece.shape;
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const nx = piece.x + x + offsetX;
      const ny = piece.y + y + offsetY;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function merge(board, piece) {
  const next = board.map((row) => [...row]);
  piece.shape.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) {
        const by = piece.y + y;
        const bx = piece.x + x;
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) next[by][bx] = piece.type;
      }
    });
  });
  return next;
}

function clearLines(board) {
  let cleared = 0;
  const kept = board.filter((row) => {
    const full = row.every(Boolean);
    if (full) cleared += 1;
    return !full;
  });
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(EMPTY));
  return { board: kept, cleared };
}

function drawBoard(board, piece, ghost) {
  const drawn = board.map((row) => [...row]);
  if (ghost) {
    ghost.shape.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell) {
          const by = ghost.y + y;
          const bx = ghost.x + x;
          if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS && !drawn[by][bx]) drawn[by][bx] = "GHOST";
        }
      });
    });
  }
  if (piece) {
    piece.shape.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell) {
          const by = piece.y + y;
          const bx = piece.x + x;
          if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) drawn[by][bx] = piece.type;
        }
      });
    });
  }
  return drawn;
}

function getGhost(board, piece) {
  const ghost = { ...piece, shape: piece.shape.map((row) => [...row]) };
  while (!collides(board, ghost, 0, 1)) ghost.y += 1;
  return ghost;
}

function MiniPiece({ piece }) {
  if (!piece) return null;
  const size = 4;
  const padRows = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => piece.shape[y]?.[x] || 0)
  );
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/25 p-3">
      {padRows.flatMap((row, y) =>
        row.map((cell, x) => (
          <div
            key={`${y}-${x}`}
            className={`h-5 w-5 rounded border ${cell ? COLORS[piece.type] : "border-white/5 bg-white/5"}`}
          />
        ))
      )}
    </div>
  );
}

export default function TetrisLikeGame() {
  const [board, setBoard] = useState(() => emptyBoard());
  const [piece, setPiece] = useState(() => pickPiece());
  const [nextPieces, setNextPieces] = useState(() => [pickPiece(), pickPiece(), pickPiece()]);
  const [hold, setHold] = useState(null);
  const [canHold, setCanHold] = useState(true);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [running, setRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const tickRef = useRef(null);

  const speed = Math.max(90, 760 - (level - 1) * 55);

  const spawnNext = useCallback((baseBoard, extraScore = 0, extraLines = 0) => {
    setNextPieces((queue) => {
      const [next, ...rest] = queue;
      const newQueue = [...rest, pickPiece()];
      const fresh = { ...next, x: Math.floor(COLS / 2) - Math.ceil(next.shape[0].length / 2), y: 0 };
      if (collides(baseBoard, fresh)) {
        setGameOver(true);
        setRunning(false);
      } else {
        setPiece(fresh);
      }
      return newQueue;
    });
    if (extraScore) setScore((s) => s + extraScore);
    if (extraLines) {
      setLines((l) => {
        const total = l + extraLines;
        setLevel(Math.floor(total / 10) + 1);
        return total;
      });
    }
    setCanHold(true);
  }, []);

  const lockPiece = useCallback(() => {
    setBoard((oldBoard) => {
      const merged = merge(oldBoard, piece);
      const { board: clearedBoard, cleared } = clearLines(merged);
      const lineScores = [0, 100, 300, 500, 800];
      spawnNext(clearedBoard, lineScores[cleared] * level, cleared);
      return clearedBoard;
    });
  }, [level, piece, spawnNext]);

  const move = useCallback(
    (dx, dy) => {
      if (!running || gameOver) return;
      setPiece((p) => {
        if (!collides(board, p, dx, dy)) return { ...p, x: p.x + dx, y: p.y + dy };
        if (dy === 1 && dx === 0) setTimeout(lockPiece, 0);
        return p;
      });
    },
    [board, gameOver, lockPiece, running]
  );

  const rotatePiece = useCallback(
    (dir = 1) => {
      if (!running || gameOver) return;
      setPiece((p) => {
        const nextShape = rotate(p.shape, dir);
        const kicks = [0, -1, 1, -2, 2];
        for (const kick of kicks) {
          if (!collides(board, p, kick, 0, nextShape)) return { ...p, x: p.x + kick, shape: nextShape };
        }
        return p;
      });
    },
    [board, gameOver, running]
  );

  const hardDrop = useCallback(() => {
    if (!running || gameOver) return;
    setPiece((p) => {
      const dropped = getGhost(board, p);
      setTimeout(() => lockPiece(), 0);
      setScore((s) => s + Math.max(0, dropped.y - p.y) * 2);
      return dropped;
    });
  }, [board, gameOver, lockPiece, running]);

  const holdPiece = useCallback(() => {
    if (!running || gameOver || !canHold) return;
    setCanHold(false);
    if (hold) {
      const swap = { ...hold, x: Math.floor(COLS / 2) - Math.ceil(hold.shape[0].length / 2), y: 0 };
      setHold({ ...piece, x: 0, y: 0 });
      if (!collides(board, swap)) setPiece(swap);
    } else {
      setHold({ ...piece, x: 0, y: 0 });
      setNextPieces((queue) => {
        const [next, ...rest] = queue;
        const fresh = { ...next, x: Math.floor(COLS / 2) - Math.ceil(next.shape[0].length / 2), y: 0 };
        setPiece(fresh);
        return [...rest, pickPiece()];
      });
    }
  }, [board, canHold, gameOver, hold, piece, running]);

  const reset = useCallback(() => {
    setBoard(emptyBoard());
    setPiece(pickPiece());
    setNextPieces([pickPiece(), pickPiece(), pickPiece()]);
    setHold(null);
    setCanHold(true);
    setScore(0);
    setLines(0);
    setLevel(1);
    setRunning(true);
    setGameOver(false);
  }, []);

  useEffect(() => {
    if (!running || gameOver) return undefined;
    tickRef.current = window.setInterval(() => move(0, 1), speed);
    return () => window.clearInterval(tickRef.current);
  }, [gameOver, move, running, speed]);

  useEffect(() => {
    const onKey = (e) => {
      const key = e.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowdown", " ", "z", "x", "c", "p", "r"].includes(key)) e.preventDefault();
      if (key === "arrowleft") move(-1, 0);
      if (key === "arrowright") move(1, 0);
      if (key === "arrowdown") move(0, 1);
      if (key === " ") hardDrop();
      if (key === "z") rotatePiece(-1);
      if (key === "x" || key === "arrowup") rotatePiece(1);
      if (key === "c") holdPiece();
      if (key === "p") setRunning((v) => !v);
      if (key === "r") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hardDrop, holdPiece, move, reset, rotatePiece]);

  const ghost = useMemo(() => getGhost(board, piece), [board, piece]);
  const view = useMemo(() => drawBoard(board, piece, ghost), [board, ghost, piece]);

  return (
    <div className="min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-900 p-4 text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4">
        <motion.div initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center">
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
            NEO BLOCKS
          </h1>
          <p className="mt-1 text-sm text-violet-100/80">Tetris風の落ちものパズル。矢印キーで操作、スペースで一気に落下。</p>
        </motion.div>

        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-[220px_1fr_260px]">
          <div className="order-2 flex flex-row gap-4 lg:order-1 lg:flex-col">
            <Card className="flex-1 border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
              <CardContent className="p-4">
                <div className="mb-2 text-xl font-black uppercase tracking-wide">Hold</div>
                <MiniPiece piece={hold} />
                <p className="mt-2 text-xs text-violet-100/70">Cキーで1ターン1回だけ交換</p>
              </CardContent>
            </Card>

            <Card className="flex-1 border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
              <CardContent className="space-y-3 p-4">
                <Stat label="LEVEL" value={level} />
                <Stat label="LINES" value={lines} />
                <Stat label="SCORE" value={score.toLocaleString()} />
              </CardContent>
            </Card>
          </div>

          <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="order-1 mx-auto lg:order-2">
            <div className="relative rounded-[2rem] border-4 border-white/25 bg-slate-950/90 p-3 shadow-2xl shadow-purple-950/80">
              <div className="grid gap-[3px] rounded-2xl bg-black/40 p-2" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                {view.flatMap((row, y) =>
                  row.map((cell, x) => (
                    <div
                      key={`${y}-${x}`}
                      className={`h-6 w-6 rounded-md border sm:h-7 sm:w-7 md:h-8 md:w-8 ${
                        cell ? COLORS[cell] : "border-white/5 bg-slate-900/80"
                      } shadow-inner`}
                    />
                  ))
                )}
              </div>

              {gameOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[1.75rem] bg-black/70 p-6 text-center backdrop-blur-sm">
                  <div className="text-4xl font-black">GAME OVER</div>
                  <p className="mt-2 text-violet-100/80">スコア {score.toLocaleString()}</p>
                  <Button onClick={reset} className="mt-5 rounded-2xl">
                    <RefreshCw className="mr-2 h-4 w-4" /> もう一度
                  </Button>
                </div>
              )}

              {!running && !gameOver && (
                <div className="absolute inset-0 flex items-center justify-center rounded-[1.75rem] bg-black/45 text-4xl font-black backdrop-blur-sm">
                  PAUSED
                </div>
              )}
            </div>
          </motion.div>

          <div className="order-3 space-y-4">
            <Card className="border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
              <CardContent className="p-4">
                <div className="mb-2 text-xl font-black uppercase tracking-wide">Next</div>
                <div className="space-y-3">
                  {nextPieces.map((p, i) => (
                    <MiniPiece key={`${p.type}-${i}`} piece={p} />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur">
              <CardContent className="space-y-3 p-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => setRunning((v) => !v)} variant="secondary" className="rounded-2xl">
                    {running ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />} P
                  </Button>
                  <Button onClick={reset} variant="secondary" className="rounded-2xl">
                    <RefreshCw className="mr-2 h-4 w-4" /> R
                  </Button>
                  <Button onClick={() => rotatePiece(-1)} variant="secondary" className="rounded-2xl">
                    <RotateCcw className="mr-2 h-4 w-4" /> Z
                  </Button>
                  <Button onClick={() => rotatePiece(1)} variant="secondary" className="rounded-2xl">
                    <RotateCw className="mr-2 h-4 w-4" /> X
                  </Button>
                </div>
                <div className="rounded-2xl bg-black/25 p-3 text-sm leading-7 text-violet-100/85">
                  ← →：左右移動<br />↓：ソフトドロップ<br />Space：ハードドロップ<br />C：ホールド<br />P：一時停止
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl bg-black/25 p-3">
      <div className="text-xs font-bold tracking-[0.25em] text-violet-200/70">{label}</div>
      <div className="text-3xl font-black tabular-nums">{value}</div>
    </div>
  );
}
