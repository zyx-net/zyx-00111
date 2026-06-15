@echo off
chcp 65001 >nul
echo ========================================
echo   离线交付包功能验证脚本
echo ========================================
echo.

echo [1/7] 正在检查服务状态...
curl -s http://localhost:3001/api/batches >nul 2>&1
if errorlevel 1 (
    echo 错误：后端服务未运行！
    echo 请先运行: npm run dev
    pause
    exit /b 1
)
echo   ✓ 后端服务正在运行

echo.
echo [2/7] 运行交付包完整回归测试...
node test-delivery-complete.cjs
if errorlevel 1 (
    echo   ✗ 完整回归测试失败
    set TEST_FAILED=1
) else (
    echo   ✓ 完整回归测试通过
)

echo.
echo [3/7] 运行并发场景测试...
node test-delivery-concurrency.cjs
if errorlevel 1 (
    echo   ✗ 并发场景测试失败
    set CONCURRENCY_FAILED=1
) else (
    echo   ✓ 并发场景测试通过
)

echo.
echo [4/7] 运行权限隔离测试...
node test-delivery-permissions.cjs
if errorlevel 1 (
    echo   ✗ 权限隔离测试失败
    set PERMISSION_FAILED=1
) else (
    echo   ✓ 权限隔离测试通过
)

echo.
echo [5/7] 生成示例数据...
node generate-delivery-sample.cjs
if errorlevel 1 (
    echo   ✗ 示例数据生成失败
) else (
    echo   ✓ 示例数据生成成功
)

echo.
echo [6/7] 运行原始回归测试...
node test-delivery-package.cjs
if errorlevel 1 (
    echo   ✗ 原始回归测试失败
    set ORIGINAL_FAILED=1
) else (
    echo   ✓ 原始回归测试通过
)

echo.
echo [7/7] 运行可复现验证...
node verify-delivery-package.cjs
if errorlevel 1 (
    echo   ✗ 可复现验证失败
    set VERIFY_FAILED=1
) else (
    echo   ✓ 可复现验证通过
)

echo.
echo ========================================
echo   验证完成
echo ========================================
echo.
echo 已创建的测试文件:
echo   - test-delivery-complete.cjs  (完整回归测试)
echo   - test-delivery-concurrency.cjs  (并发场景测试)
echo   - test-delivery-permissions.cjs  (权限隔离测试)
echo   - test-delivery-recovery.cjs  (重启恢复测试)
echo   - generate-delivery-sample.cjs  (示例数据)
echo   - verify-delivery-package.cjs  (可复现验证)
echo   - test-delivery-package.cjs  (原始回归测试)
echo.
echo 使用说明:
echo   1. 启动服务: npm run dev
echo   2. 访问页面: http://localhost:5173
echo   3. 进入"离线交付包"页面查看功能
echo   4. 查看README.md了解完整功能说明
echo.
if defined TEST_FAILED (
    echo   警告: 完整回归测试未完全通过
)
if defined CONCURRENCY_FAILED (
    echo   警告: 并发场景测试未完全通过
)
if defined PERMISSION_FAILED (
    echo   警告: 权限隔离测试未完全通过
)
if defined ORIGINAL_FAILED (
    echo   警告: 原始回归测试未完全通过
)
if defined VERIFY_FAILED (
    echo   警告: 可复现验证未完全通过
)
echo.
pause
