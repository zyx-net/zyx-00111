import { useState, useCallback, useEffect } from 'react';
import { useStore } from '../store';
import { Upload, Trash2, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { MeterType } from '../types';

export function Import() {
  const { batches, fetchBatches, importReadings, loading, error, deleteBatch } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const processFile = useCallback(async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const readings = jsonData.map((row: any) => {
        const dateValue = row['日期'] || row['readingDate'] || row['日期'];
        let readingDate = '';

        if (dateValue) {
          if (typeof dateValue === 'number') {
            const date = new Date((dateValue - 25569) * 86400 * 1000);
            readingDate = format(date, 'yyyy-MM-dd');
          } else if (typeof dateValue === 'string') {
            const parsed = new Date(dateValue);
            if (!isNaN(parsed.getTime())) {
              readingDate = format(parsed, 'yyyy-MM-dd');
            } else {
              readingDate = dateValue;
            }
          }
        }

        let meterType = (row['类型'] || row['meterType'] || row['能源类型'] || '').toUpperCase();
        if (meterType === '水' || meterType === 'WATER') meterType = 'WATER';
        else if (meterType === '电' || meterType === 'ELECTRICITY' || meterType === '电力') meterType = 'ELECTRICITY';
        else if (meterType === '气' || meterType === 'GAS' || meterType === '燃气') meterType = 'GAS';
        else meterType = 'ELECTRICITY';

        return {
          meterId: String(row['表计编号'] || row['meterId'] || row['表号'] || ''),
          readingDate,
          rawValue: Number(row['读数'] || row['rawValue'] || row['数值'] || 0),
          meterType: meterType as MeterType,
        };
      }).filter(r => r.meterId && r.readingDate && !isNaN(r.rawValue));

      if (readings.length === 0) {
        throw new Error('未找到有效数据，请检查文件格式');
      }

      setUploadResult({ readings, fileName: file.name });
    } catch (err: any) {
      alert(err.message || '文件解析失败');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleImport = async () => {
    if (!uploadResult) return;

    try {
      await importReadings(uploadResult.readings);
      setUploadResult(null);
      alert('导入成功！');
    } catch (err: any) {
      alert(err.message || '导入失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除该批次吗？')) {
      try {
        await deleteBatch(id);
      } catch (err: any) {
        alert(err.message || '删除失败');
      }
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">数据导入</h1>
        <p className="text-slate-500 mt-2">批量导入水电气读数数据</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
          <p className="text-lg font-medium text-slate-700 mb-2">
            {isDragging ? '释放以上传文件' : '拖拽Excel文件到此处'}
          </p>
          <p className="text-sm text-slate-500 mb-4">或</p>
          <label className="inline-block">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <span className="px-6 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
              选择文件
            </span>
          </label>
          <p className="text-xs text-slate-400 mt-4">支持 .xlsx, .xls, .csv 格式</p>
        </div>

        {uploadResult && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="font-medium text-slate-800">{uploadResult.fileName}</p>
                  <p className="text-sm text-slate-500">{uploadResult.readings.length} 条记录待导入</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setUploadResult(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? '导入中...' : '确认导入'}
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-blue-200">
                    <th className="text-left py-2 px-3 text-slate-600">表计编号</th>
                    <th className="text-left py-2 px-3 text-slate-600">日期</th>
                    <th className="text-left py-2 px-3 text-slate-600">类型</th>
                    <th className="text-right py-2 px-3 text-slate-600">读数</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadResult.readings.slice(0, 5).map((r: any, i: number) => (
                    <tr key={i} className="border-b border-blue-100">
                      <td className="py-2 px-3">{r.meterId}</td>
                      <td className="py-2 px-3">{r.readingDate}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          r.meterType === 'WATER' ? 'bg-blue-100 text-blue-700' :
                          r.meterType === 'ELECTRICITY' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {r.meterType === 'WATER' ? '水' : r.meterType === 'ELECTRICITY' ? '电' : '气'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{r.rawValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {uploadResult.readings.length > 5 && (
                <p className="text-sm text-slate-500 mt-2 text-center">
                  ... 还有 {uploadResult.readings.length - 5} 条记录
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200 text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">导入批次列表</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-3 px-6 text-sm font-medium text-slate-600">批次号</th>
                <th className="text-left py-3 px-6 text-sm font-medium text-slate-600">导入时间</th>
                <th className="text-right py-3 px-6 text-sm font-medium text-slate-600">数据条数</th>
                <th className="text-right py-3 px-6 text-sm font-medium text-slate-600">异常数</th>
                <th className="text-center py-3 px-6 text-sm font-medium text-slate-600">状态</th>
                <th className="text-center py-3 px-6 text-sm font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-4 px-6 font-mono text-sm">{batch.batchNo}</td>
                  <td className="py-4 px-6 text-slate-600">{format(new Date(batch.importedAt), 'yyyy-MM-dd HH:mm')}</td>
                  <td className="py-4 px-6 text-right">{batch.totalCount}</td>
                  <td className="py-4 px-6 text-right">
                    {batch.anomalyCount > 0 ? (
                      <span className="text-orange-600 font-medium">{batch.anomalyCount}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-center">
                    {batch.anomalyCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">
                        <AlertTriangle className="w-3 h-3" />
                        有异常
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        <CheckCircle className="w-3 h-3" />
                        完成
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-center">
                    <button
                      onClick={() => handleDelete(batch.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除批次"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    暂无导入记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
