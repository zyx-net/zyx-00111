@echo off
chcp 65001 >nul
echo ========================================
echo   离线交付包功能验证脚本
echo ========================================
echo.

echo [1/4] 正在检查服务状态...
curl -s http://localhost:3001/api/batches >nul 2>&1
if errorlevel 1 (
    echo 错误：后端服务未运行！
    echo 请先运行: npm run dev
    pause
    exit /b 1
)
echo   ✓ 后端服务正在运行

echo.
echo [2/4] 运行交付包回归测试...
node test-delivery-package.cjs
if errorlevel 1 (
    echo   ✗ 回归测试失败
    set TEST_FAILED=1
) else (
    echo   ✓ 回归测试通过
)

echo.
echo [3/4] 生成示例数据...
node generate-delivery-sample.cjs
if errorlevel 1 (
    echo   ✗ 示例数据生成失败
) else (
    echo   ✓ 示例数据生成成功
)

echo.
echo [4/4] 运行可复现验证...
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
echo 已创建的文件:
echo   - test-delivery-package.cjs  (回归测试)
echo   - generate-delivery-sample.cjs  (示例数据)
echo   - verify-delivery-package.cjs  (可复现验证)
echo.
echo 使用说明:
echo   1. 启动服务: npm run dev
echo   2. 访问页面: http://localhost:5173
echo   3. 进入"离线交付包"页面查看功能
echo.
if defined TEST_FAILED (
    echo   警告: 回归测试未完全通过
)
if defined VERIFY_FAILED (
    echo   警告: 可复现验证未完全通过
)
echo.
pause
