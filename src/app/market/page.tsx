import MarketForm from "./MarketForm";

export default function MarketPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Market Data</h1>
        <p className="text-sm text-slate-500">
          Thay thế tạm thời cho pipeline ingestion tự động: nhập/điều chỉnh tham số thị trường lấy từ
          nguồn trên mạng (Phú Quý, silver/gold/DXY, FRED, CFTC COT...). Mỗi lần lưu sẽ tạo một
          feature snapshot mới và tính lại Risk Score / Regime / Policy ngay lập tức.
        </p>
      </div>
      <MarketForm />
    </div>
  );
}
