export function StatusBadge({ status }: { status: string }) {
  let bgColor = "bg-gray-100";
  let textColor = "text-gray-800";

  if (status === "active") {
    bgColor = "bg-green-100";
    textColor = "text-green-800";
  } else if (status === "suspended") {
    bgColor = "bg-red-100";
    textColor = "text-red-800";
  } else if (status === "pending") {
    bgColor = "bg-yellow-100";
    textColor = "text-yellow-800";
  }

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bgColor} ${textColor}`}>
      {status}
    </span>
  );
}
