#!/usr/bin/env bash

set -u

PROJECT_DIR="${1:-$(pwd)}"

echo "========================================"
echo " Next.js CPU 排查脚本"
echo " 项目目录: $PROJECT_DIR"
echo "========================================"
echo

cd "$PROJECT_DIR" || {
  echo "无法进入目录: $PROJECT_DIR"
  exit 1
}

print_section() {
  echo
  echo "----------------------------------------"
  echo "$1"
  echo "----------------------------------------"
}

exists_cmd() {
  command -v "$1" >/dev/null 2>&1
}

print_section "1. 基础项目信息"

if [ -f package.json ]; then
  echo "发现 package.json"
else
  echo "未发现 package.json，请确认你在 Next.js 项目根目录运行"
fi

if [ -f next.config.js ] || [ -f next.config.mjs ] || [ -f next.config.ts ]; then
  echo "发现 Next 配置文件:"
  ls next.config.* 2>/dev/null
else
  echo "未发现 next.config.*"
fi

if [ -d app ]; then
  echo "发现 app/ 目录，可能使用 App Router"
fi

if [ -d pages ]; then
  echo "发现 pages/ 目录，可能使用 Pages Router"
fi

if exists_cmd node; then
  echo "Node 版本: $(node -v)"
fi

if exists_cmd npm; then
  echo "npm 版本: $(npm -v)"
fi

if exists_cmd pnpm; then
  echo "pnpm 版本: $(pnpm -v)"
fi

if exists_cmd yarn; then
  echo "yarn 版本: $(yarn -v)"
fi

print_section "2. 当前 Node / Next 相关进程 CPU 占用"

if exists_cmd ps; then
  ps -Ao pid,pcpu,pmem,command \
    | grep -E "node|next|turbo|webpack" \
    | grep -v grep \
    | sort -k2 -nr \
    | head -20
else
  echo "当前系统没有 ps 命令"
fi

print_section "3. 重点目录大小"

for dir in .next node_modules public dist build coverage logs tmp data uploads; do
  if [ -e "$dir" ]; then
    du -sh "$dir" 2>/dev/null
  fi
done

print_section "4. 重点目录文件数量"

for dir in public .next dist build coverage logs tmp data uploads; do
  if [ -d "$dir" ]; then
    count=$(find "$dir" -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "$dir: $count 个文件"

    if [ "$count" -gt 10000 ]; then
      echo "  ⚠️  $dir 文件数量很多，可能导致 Next dev 文件监听 CPU 很高"
    fi
  fi
done

print_section "5. 查找项目中的大文件"

echo "大于 50MB 的文件:"
find . \
  -path "./node_modules" -prune -o \
  -path "./.next" -prune -o \
  -type f -size +50M -print 2>/dev/null \
  | head -50

print_section "6. 检查 Tailwind content 配置"

TAILWIND_FILES=$(find . -maxdepth 3 \( \
  -name "tailwind.config.js" -o \
  -name "tailwind.config.cjs" -o \
  -name "tailwind.config.mjs" -o \
  -name "tailwind.config.ts" \
\) 2>/dev/null)

if [ -z "$TAILWIND_FILES" ]; then
  echo "未发现 tailwind.config.*"
else
  echo "$TAILWIND_FILES" | while read -r file; do
    echo
    echo "检查: $file"

    if grep -nE "\./\*\*/\*|\*\*/\*" "$file" >/dev/null 2>&1; then
      echo "  ⚠️  发现较宽的扫描范围:"
      grep -nE "\./\*\*/\*|\*\*/\*" "$file"
      echo "  建议避免扫描 node_modules、.next、dist、public 等目录"
    else
      echo "  未发现明显过宽的 content 扫描配置"
    fi

    if grep -nE "node_modules|\.next|dist|public" "$file" >/dev/null 2>&1; then
      echo "  ⚠️  content 里可能包含不建议扫描的目录:"
      grep -nE "node_modules|\.next|dist|public" "$file"
    fi
  done
fi

print_section "7. 检查 package.json dev 脚本"

if [ -f package.json ]; then
  if exists_cmd node; then
    node - <<'NODE'
const fs = require("fs");

try {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const scripts = pkg.scripts || {};

  console.log("scripts.dev:", scripts.dev || "未定义");

  if (scripts.dev && scripts.dev.includes("--turbo")) {
    console.log("⚠️  dev 脚本启用了 Turbopack: --turbo");
    console.log("   如果 CPU 异常，可以尝试临时改成 next dev 对比。");
  }

  if (scripts.dev && scripts.dev.includes("next dev")) {
    console.log("发现 next dev");
  }

  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  if (deps.next) {
    console.log("Next 版本:", deps.next);
  }

  if (deps.react) {
    console.log("React 版本:", deps.react);
  }

  if (deps.tailwindcss) {
    console.log("Tailwind 版本:", deps.tailwindcss);
  }
} catch (err) {
  console.log("无法解析 package.json:", err.message);
}
NODE
  else
    grep -n '"dev"' package.json
  fi
fi

print_section "8. 搜索可能导致频繁动态渲染的 Next 配置"

echo "搜索 cache: \"no-store\" / force-dynamic / revalidate = 0"
grep -RIn \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir=build \
  -E "cache:\s*['\"]no-store['\"]|dynamic\s*=\s*['\"]force-dynamic['\"]|revalidate\s*=\s*0" \
  app pages src components 2>/dev/null \
  | head -80

print_section "9. 搜索可疑 useEffect 写法"

echo "下面只是粗略检查，不一定都是问题。重点看 useEffect 里是否 setState、fetch、router.push 后导致循环。"
grep -RIn \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir=build \
  -E "useEffect\s*\(" \
  app pages src components 2>/dev/null \
  | head -120

print_section "10. 搜索定时器 / 轮询 / watcher"

grep -RIn \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir=build \
  -E "setInterval|setTimeout|chokidar|fs\.watch|watchFile" \
  app pages src components server lib 2>/dev/null \
  | head -120

print_section "11. 检查是否存在大量日志或临时文件"

for dir in logs tmp data uploads public/uploads public/upload public/assets; do
  if [ -d "$dir" ]; then
    echo
    echo "$dir:"
    du -sh "$dir" 2>/dev/null
    find "$dir" -type f 2>/dev/null | wc -l | awk '{print "文件数量: " $1}'
  fi
done

print_section "12. 建议的下一步"

cat <<'EOF'
建议按下面顺序排查：

1. 先清理 Next 缓存：
   rm -rf .next

2. 再启动开发模式：
   npm run dev
   或：
   pnpm dev

3. 对比生产模式 CPU：
   npm run build
   npm run start

4. 如果生产模式正常、dev 模式高：
   优先检查：
   - public 文件是否太多
   - Tailwind content 是否写成 ./**/*
   - 是否开启了 --turbo
   - 是否有特别大的日志、缓存、上传目录在项目内

5. 如果生产模式也高：
   优先检查：
   - useEffect 循环 setState
   - API route 死循环
   - setInterval 高频轮询
   - Server Component 中 no-store / force-dynamic 反复请求
   - 数据库查询或接口请求是否被无限触发

6. 如果当前 ps 里 node 进程 CPU 很高，可以复制对应 PID 后执行：
   ps -p <PID> -o pid,pcpu,pmem,command

EOF

echo "排查完成。"