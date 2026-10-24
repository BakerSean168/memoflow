# Feature 分支示例

这是一个示例 feature 分支，用于演示 Git Flow 工作流。

## 使用步骤

1. **创建 feature 分支**:

   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/your-feature-name
   ```

2. **开发功能**:
   - 编写代码
   - 编写测试
   - 运行测试确保通过
   - 频繁提交

3. **推送到远程**:

   ```bash
   git push origin feature/your-feature-name
   ```

4. **创建 Pull Request**:
   - 在 GitHub 上创建 PR
   - 目标分支: `dev`
   - 添加描述和相关信息
   - 请求代码审查

5. **合并后清理**:
   ```bash
   git checkout dev
   git pull origin dev
   git branch -d feature/your-feature-name
   git push origin --delete feature/your-feature-name
   ```

## 注意事项

- ✅ 始终从最新的 `dev` 创建
- ✅ 功能完成前频繁提交
- ✅ 推送前先运行测试
- ✅ PR 中写清楚改动内容
- ✅ 合并后及时删除分支
