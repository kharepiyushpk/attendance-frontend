import { useState, useEffect } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

const API_BASE = import.meta.env.VITE_API_BASE;

const months = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const statusOptions = ["--Select--","Present","Absent","Late","Half-day","Holiday","On Leave"];
const statusColors = {
  Present: "bg-green-100 text-green-800",
  Absent: "bg-red-100 text-red-800",
  Late: "bg-yellow-100 text-yellow-800",
  "Half-day": "bg-orange-100 text-orange-800",
  Holiday: "bg-blue-100 text-blue-800",
  "On Leave": "bg-blue-200 text-blue-800"
};

export default function AttendanceSheet() {
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [employees, setEmployees] = useState([]); 
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeRole, setEmployeeRole] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [editEmployeeId, setEditEmployeeId] = useState("");
  const [editEmployeeName, setEditEmployeeName] = useState("");
  const [editEmployeeRole, setEditEmployeeRole] = useState("");

  const maxDaysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const displayDays = maxDaysInMonth;
  const currentYear = today.getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => currentYear + i);

  // ---------- Fetch employees ----------
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/employees`);
        if (!res.ok) throw new Error("Failed to fetch employees");
        const data = await res.json();
        setEmployees(data);
      } catch (err) {
        console.error("❌ Failed to fetch employees", err);
      }
    };
    fetchEmployees();
  }, []);

  // ---------- Helpers ----------
  const getAttendanceRecord = (emp) => {
    if (!emp?.attendance) return null;
    return emp.attendance.find(a => a.year === selectedYear && a.month === selectedMonth) || null;
  };

  const getAttendanceStatus = (emp, day) => {
    const rec = getAttendanceRecord(emp);
    if (!rec || !rec.days) return "";
    if (typeof rec.days.get === "function") {
      return rec.days.get(String(day)) || "";
    }
    return rec.days[String(day)] || "";
  };

  const getTotalPresent = (emp) => {
    const rec = getAttendanceRecord(emp);
    if (!rec) return 0;
    const days = rec.days;
    let values;
    if (days && typeof days.values === "function") {
      values = Array.from(days.values());
    } else {
      values = Object.values(days || {});
    }
    return values.filter(s => s === "Present").length;
  };

  const getWorkingDays = () => {
    const holidaySet = new Set();
    employees.forEach(emp => {
      const rec = getAttendanceRecord(emp);
      if (!rec) return;
      const days = rec.days;
      if (days && typeof days.entries === "function") {
        for (const [d, s] of days.entries()) {
          if (s === "Holiday") holidaySet.add(d);
        }
      } else {
        Object.entries(days || {}).forEach(([d, s]) => {
          if (s === "Holiday") holidaySet.add(d);
        });
      }
    });
    return Math.max(0, maxDaysInMonth - holidaySet.size);
  };

  // ---------- CRUD ----------
  const handleAddEmployee = async () => {
    const id = employeeId.trim();
    const name = employeeName.trim();
    const role = employeeRole.trim();
    if (!id || !name || !role) return;

    try {
      const res = await fetch(`${API_BASE}/api/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empId: id, name, role })
      });
      if (!res.ok) throw new Error("Failed to add employee");
      const newEmployee = await res.json();
      setEmployees(prev => [...prev, newEmployee]);
      setEmployeeId(""); setEmployeeName(""); setEmployeeRole(""); setShowAddForm(false);
      setMessage({ type: "success", text: "Employee added" });
    } catch (err) {
      console.error("❌ Failed to add employee", err);
      setMessage({ type: "error", text: "Failed to add employee" });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleStatusChange = async (empId, day, status) => {
    try {
      const res = await fetch(`${API_BASE}/api/employees/${encodeURIComponent(String(empId))}/attendance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: selectedYear, month: selectedMonth, day, status })
      });
      if (!res.ok) throw new Error("Failed to update attendance");
      const updatedEmployee = await res.json();
      setEmployees(prev =>
        prev.map(e => String(e.empId).trim() === String(empId).trim() ? updatedEmployee : e)
      );
    } catch (err) {
      console.error("❌ Failed to update attendance", err);
      setMessage({ type: "error", text: "Failed to update attendance" });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const removeEmployee = async (empId) => {
    if (!window.confirm("Are you sure you want to remove this employee?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/employees/${encodeURIComponent(empId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete employee");
      setEmployees(prev => prev.filter(e => e.empId !== empId));
      setMessage({ type: "success", text: "Employee removed" });
    } catch (err) {
      console.error("❌ Failed to delete employee", err);
      setMessage({ type: "error", text: "Failed to delete employee" });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const saveEmployeeEdit = async (originalEmpId) => {
    const newEmpId = editEmployeeId.trim();
    const name = editEmployeeName.trim();
    const role = editEmployeeRole.trim();
    if (!newEmpId || !name || !role) return;

    try {
      const res = await fetch(`${API_BASE}/api/employees/${encodeURIComponent(originalEmpId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empId: newEmpId, name, role })
      });
      if (!res.ok) throw new Error("Failed to update employee");
      const updatedEmployee = await res.json();
      setEmployees(prev => prev.map(e => e.empId === originalEmpId ? updatedEmployee : e));
      setEditingEmpId(null);
      setMessage({ type: "success", text: "Employee updated" });
    } catch (err) {
      console.error("❌ Failed to update employee", err);
      setMessage({ type: "error", text: "Failed to update employee" });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const saveAttendance = async () => {
    setMessage({ type: "success", text: "All changes are saved (auto-saved on each change)." });
    setTimeout(() => setMessage(null), 2000);
  };

  // ---------- Export ----------
  const exportToCSV = () => {
    const header = ["Employee ID","Employee Name","Role","Total Present","Working Days", ...Array.from({ length: maxDaysInMonth }, (_, i) => `Day ${i + 1}`)];
    const rows = employees.map(emp => {
      const rec = getAttendanceRecord(emp);
      const row = [
        emp.empId,
        emp.name,
        emp.role,
        getTotalPresent(emp),
        getWorkingDays(),
        ...Array.from({ length: maxDaysInMonth }, (_, day) => {
          if (!rec?.days) return "";
          if (typeof rec.days.get === "function") {
            return rec.days.get(String(day + 1)) || "";
          }
          return rec.days[String(day + 1)] || "";
        })
      ];
      return row.join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `attendance_${selectedMonth}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Attendance");

    const header = ["Employee ID","Employee Name","Role","Total Present", ...Array.from({ length: maxDaysInMonth }, (_, i) => `Day ${i + 1}`)];
    const headerRow = sheet.addRow(header);

    headerRow.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
      cell.font = { bold: true, color: { argb: "FF000000" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });

    employees.forEach(emp => {
      const rec = getAttendanceRecord(emp);
      const row = [
        emp.empId,
        emp.name,
        emp.role,
        getTotalPresent(emp),
        ...Array.from({ length: maxDaysInMonth }, (_, day) => {
          if (!rec?.days) return "";
          if (typeof rec.days.get === "function") {
            return rec.days.get(String(day + 1)) || "";
          }
          return rec.days[String(day + 1)] || "";
        })
      ];
      sheet.addRow(row);
    });

    sheet.columns.forEach(col => { col.width = 15; });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `attendance_${selectedMonth}_${selectedYear}.xlsx`);
  };

  // ---------- Filter ----------
  const filteredEmployees = employees.filter(emp =>
    emp.empId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ---------- JSX ----------
  return (
    <div className="p-6 bg-gray-100 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
        <h1 className="text-4xl font-extrabold text-center text-gray-800 mb-2">ADRS Attendance Sheet</h1>

        {message && (
          <div className={`mb-4 text-center font-semibold ${message.type === "success" ? "text-green-700" : "text-red-700"}`}>
            {message.text}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4 mb-8 p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center space-x-2 w-full md:w-auto">
            <label className="font-medium text-gray-700">Month:</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            >
              {months.map((month, i) => <option key={i} value={i + 1}>{month}</option>)}
            </select>
            <label className="font-medium text-gray-700 ml-2">Year:</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            >
              {years.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>

          {/* Add Employee Section */}
          <div className="mb-6">
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow"
              >
                + Add New Employee
              </button>
            ) : (
              <div className="bg-gray-50 p-4 rounded-lg shadow-md border border-gray-200 w-full max-w-xl">
                <h3 className="text-lg font-semibold mb-3">Add Employee</h3>
                <div className="flex flex-col gap-3">
                  <input type="text" placeholder="Employee ID" value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="border p-2 rounded"/>
                  <input type="text" placeholder="Employee Name" value={employeeName} onChange={e => setEmployeeName(e.target.value)} className="border p-2 rounded"/>
                  <input type="text" placeholder="Employee Role" value={employeeRole} onChange={e => setEmployeeRole(e.target.value)} className="border p-2 rounded"/>
                  <div className="flex gap-2">
                    <button onClick={handleAddEmployee} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow">Add</button>
                    <button onClick={() => setShowAddForm(false)} className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded-lg shadow">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto">
            <input type="text" placeholder="Search employee..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors w-48" />
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto">
            <label className="font-medium text-gray-700">Working Days:</label>
            <input
              type="number"
              value={getWorkingDays()}
              readOnly
              className="w-20 p-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
            />
          </div>
        </div>

        {/* Save & Export Buttons */}
        <div className="flex justify-center gap-4 mb-4">
          <button onClick={saveAttendance} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Save Attendance
          </button>
          <button onClick={exportToCSV} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Export CSV</button>
        </div>

        {/* Attendance Table */}
        <div className="overflow-x-auto relative rounded-xl shadow-inner border border-gray-200">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
              <tr>
                <th className="py-3 px-6 whitespace-nowrap min-w-[100px] sticky left-0 bg-gray-100 z-10">ID</th>
                <th className="py-3 px-6 whitespace-nowrap min-w-[150px] sticky left-[100px] bg-gray-100 z-10">Employee Name</th>
                <th className="py-3 px-6 min-w-[120px] sticky left-[250px] bg-gray-100 z-10">Role & Responsibility</th>
                <th className="py-3 px-6 sticky left-[370px] bg-gray-100 z-10 text-center">Actions</th>
                <th className="py-3 px-6 whitespace-nowrap min-w-[120px] text-center bg-gray-100 z-10">Total Present</th>
                {Array.from({ length: displayDays }, (_, i) => (
                  <th key={i} className="py-3 px-3 whitespace-nowrap min-w-[100px] text-center">{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => {
                const empId = emp.empId;
                const isEditing = editingEmpId === empId;
                return (
                  <tr key={empId} className="bg-white border-b hover:bg-gray-50 transition-colors h-14">
                    <td className="py-3 px-6 sticky left-0 bg-white z-10">
                      {isEditing ? (
                        <input type="text" value={editEmployeeId} onChange={e => setEditEmployeeId(e.target.value)} className="border p-1 rounded w-full"/>
                      ) : empId}
                    </td>
                    <td className="py-3 px-6 sticky left-[100px] bg-white z-10">
                      {isEditing ? (
                        <input type="text" value={editEmployeeName} onChange={e => setEditEmployeeName(e.target.value)} className="border p-1 rounded w-full"/>
                      ) : emp.name}
                    </td>
                    <td className="py-3 px-3 sticky left-[250px] bg-white z-10 text-center font-medium text-gray-800">
                      {isEditing ? (
                        <input type="text" value={editEmployeeRole} onChange={e => setEditEmployeeRole(e.target.value)} className="border p-1 rounded w-full"/>
                      ) : emp.role}
                    </td>
                    <td className="py-3 px-6 sticky left-[370px] bg-white z-10 flex justify-center gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEmployeeEdit(empId)} className="text-green-600 hover:text-green-800 font-semibold px-2 py-1 border border-green-600 rounded">Save</button>
                          <button onClick={() => setEditingEmpId(null)} className="text-gray-600 hover:text-gray-800 font-semibold px-2 py-1 border border-gray-400 rounded">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingEmpId(empId); setEditEmployeeId(empId); setEditEmployeeName(emp.name); setEditEmployeeRole(emp.role); }} className="text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 border border-blue-600 rounded">Edit</button>
                          <button onClick={() => removeEmployee(empId)} className="text-red-600 hover:text-red-800 font-semibold px-2 py-1 border border-red-600 rounded">Remove</button>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-gray-800">{getTotalPresent(emp)}</td>
                    {Array.from({ length: displayDays }, (_, dayIndex) => {
                      const day = dayIndex + 1;
                      const status = getAttendanceStatus(emp, day);
                      return (
                        <td key={day} className="py-3 px-3 text-center">
                          <select value={status} onChange={e => handleStatusChange(empId, day, e.target.value)} className={`w-full p-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 ${statusColors[status] || ""}`}>
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
