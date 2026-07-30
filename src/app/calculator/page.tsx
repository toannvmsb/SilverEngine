import CalculatorForm from "./CalculatorForm";

export default function CalculatorPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Transaction Decision Calculator</h1>
        <p className="text-sm text-slate-500">
          POST /v1/decisions — tính LTV, số tiền cho vay tối đa, lãi suất đề xuất và quyết định
          Approve/Refer/Decline/Stop cho một giao dịch cầm bạc cụ thể.
        </p>
      </div>
      <CalculatorForm />
    </div>
  );
}
