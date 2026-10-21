export function Footer({ helpUrl }) {
  return (
    <div className="mx-auto mt-6 max-w-[600px] px-6 text-center text-xs/5 text-slate-500">
      <p>
        Questions about your order?{" "}
        <a href={helpUrl} className="text-indigo-600 underline">
          Visit the help centre
        </a>
        .
      </p>
      <p className="mt-2">Northvale Supply Co., 77 Foundry Lane, Portland, OR 97209</p>
    </div>
  );
}
