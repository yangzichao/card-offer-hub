# 跨脚本共享模块

放在这里的 `.js` 文件可以被任意 issuer 的脚本引用：在该脚本的 `userscript.json` 里把相对路径写进 `sharedModules`，构建时会按顺序拼在这个脚本自己的 `sources` 之前。

```json
{
    "sharedModules": ["rate-limit/request-queue.js"],
    "sources": ["core/state.js", "..."]
}
```

约束与 `src/` 下的模块相同：不使用 `import` / `export`，顶层声明会被拼进同一个 IIFE，所以命名必须在整个包内唯一。构建时可用的常量是 `__USERSCRIPT_ID__`、`__USERSCRIPT_NAME__`、`__USERSCRIPT_VERSION__`，会被替换成引用它的那个脚本的值。

目前还没有抽取任何共享模块。第二个脚本出现、确实有重复逻辑时再往这里搬，不要提前抽象。
