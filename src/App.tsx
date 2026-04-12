import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Edit2, Wallet, ArrowUpCircle, ArrowDownCircle, ChevronLeft, ChevronRight, Calendar as CalendarIcon, BarChart3, Home, PieChart, TrendingUp, LogOut, LogIn, AlertCircle, GripVertical } from "lucide-react";
import { motion, AnimatePresence, Reorder, useDragControls } from "motion/react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RePieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { 
  onAuthStateChanged, 
  User 
} from "firebase/auth";
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc,
  writeBatch,
  getDoc,
  getDocFromServer
} from "firebase/firestore";
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType, sanitizeData } from "./firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Expense {
  id: string;
  value: number;
  description: string;
  category: string;
  isFixed: boolean;
  isRecurring: boolean;
  repeatCount?: number;
  repeatFrequency?: "monthly" | "yearly";
  notes: string;
  date: string; // ISO string
  parentId?: string; // To group recurring expenses
  isPaid?: boolean;
  paidMonths?: string[]; // For fixed expenses: ["YYYY-MM", ...]
  order?: number;
}

interface AdditionalSalary {
  id: string;
  value: number;
  description: string;
  date: string; // ISO string
  order?: number;
}

const DEFAULT_CATEGORIES = [
  "Assinaturas",
  "Casa",
  "Transporte",
  "Comida",
  "Lazer",
  "Eletrônicos",
  "Pessoal",
  "Saúde",
  "Supermercado",
];

// Main App Component
interface ExpenseItemProps {
  expense: Expense;
  currentMonthStr: string;
  onTogglePaid: (expense: Expense) => void | Promise<void>;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  formatCurrency: (val: number) => string;
  formatDate: (dateStr: string) => string;
}

const ExpenseItem: React.FC<ExpenseItemProps> = ({ 
  expense, 
  currentMonthStr, 
  onTogglePaid, 
  onEdit, 
  onDelete, 
  formatCurrency, 
  formatDate 
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={expense}
      dragListener={false}
      dragControls={dragControls}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        "group bg-white/5 hover:bg-white/10 transition-all p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-4",
        expense.isPaid && "bg-green-500/20 border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.1)]"
      )}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div 
          className="text-white/20 group-hover:text-white/40 transition-colors cursor-grab active:cursor-grabbing p-1 -ml-1 touch-none"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Checkbox 
            checked={expense.isPaid}
            onCheckedChange={() => onTogglePaid(expense)}
            className="border-white/30 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={cn("font-bold truncate", expense.isPaid && "text-green-100")}>
              {expense.description}
            </h3>
            {expense.isFixed && <Badge className="bg-blue-500/50 text-[10px] h-4 px-1">Fixa</Badge>}
            {expense.isRecurring && <Badge className="bg-purple-500/50 text-[10px] h-4 px-1">Recorrente</Badge>}
            {expense.isPaid && <Badge className="bg-green-500 text-[10px] h-4 px-1 text-white">Pago</Badge>}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span className={cn("bg-white/10 px-2 py-0.5 rounded-full", expense.isPaid && "bg-green-500/20 text-green-200")}>{expense.category}</span>
            <span>•</span>
            <span>{formatDate(expense.date)}</span>
          </div>
          {expense.notes && <p className={cn("text-xs text-white/40 mt-1 italic", expense.isPaid && "text-green-200/40")}>{expense.notes}</p>}
        </div>
      </div>
      
      <div className="flex items-center gap-4" onPointerDown={(e) => e.stopPropagation()}>
        <div className="text-right">
          <div className={cn("font-bold text-lg", expense.isPaid ? "text-green-300" : "text-white")}>
            {formatCurrency(expense.value)}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => onEdit(expense)}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => onDelete(expense.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Reorder.Item>
  );
};

interface AdditionalSalaryItemProps {
  salary: AdditionalSalary;
  onEdit: (salary: AdditionalSalary) => void;
  onDelete: (id: string) => void;
  formatCurrency: (val: number) => string;
  formatDate: (dateStr: string) => string;
}

const AdditionalSalaryItem: React.FC<AdditionalSalaryItemProps> = ({ 
  salary, 
  onEdit, 
  onDelete, 
  formatCurrency, 
  formatDate 
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item 
      value={salary}
      dragListener={false}
      dragControls={dragControls}
      className="group bg-white/5 hover:bg-white/10 p-3 rounded-2xl transition-all border border-white/5 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div 
          className="text-white/20 group-hover:text-white/40 transition-colors cursor-grab active:cursor-grabbing p-1 -ml-1 touch-none"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(salary)} onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-1">
            <span className="font-bold text-white truncate mr-2">{salary.description}</span>
            <span className="font-bold text-green-300 shrink-0">{formatCurrency(salary.value)}</span>
          </div>
          <div className="text-xs text-white/40">
            {formatDate(salary.date)}
          </div>
        </div>
      </div>
      <div onPointerDown={(e) => e.stopPropagation()}>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={() => onDelete(salary.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Reorder.Item>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [isSavingSalary, setIsSavingSalary] = useState(false);
  const [salaryTimeout, setSalaryTimeout] = useState<NodeJS.Timeout | null>(null);

  const [salary, setSalary] = useState<number>(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [additionalSalaries, setAdditionalSalaries] = useState<AdditionalSalary[]>([]);
  const [displayExpenses, setDisplayExpenses] = useState<Expense[]>([]);
  const [displayAdditionalSalaries, setDisplayAdditionalSalaries] = useState<AdditionalSalary[]>([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"home" | "report">("home");
  const [reportRange, setReportRange] = useState<{ start: string, end: string }>(() => {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return {
      start: `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`,
      end: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    };
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdditionalSalaryModalOpen, setIsAdditionalSalaryModalOpen] = useState(false);
  const [isAdditionalSalaryListModalOpen, setIsAdditionalSalaryListModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isRecurringActionModalOpen, setIsRecurringActionModalOpen] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [isDeleteAdditionalSalaryConfirmModalOpen, setIsDeleteAdditionalSalaryConfirmModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [additionalSalaryToDelete, setAdditionalSalaryToDelete] = useState<string | null>(null);
  const [recurringActionType, setRecurringActionType] = useState<"edit" | "delete" | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingAdditionalSalary, setEditingAdditionalSalary] = useState<AdditionalSalary | null>(null);
  const [newCategory, setNewCategory] = useState("");

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Real-time Listeners
  useEffect(() => {
    if (!user) {
      setExpenses([]);
      setAdditionalSalaries([]);
      setSalary(0);
      return;
    }

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    // Listen to Settings (Salary)
    const settingsPath = `users/${user.uid}/settings/main`;
    const settingsUnsubscribe = onSnapshot(doc(db, settingsPath), (docSnap) => {
      if (docSnap.exists()) {
        const cloudSalary = docSnap.data().salary || 0;
        setSalary(prev => {
          // Only update local state if it's different from cloud
          // and we're not currently in the middle of a debounced save
          if (prev !== cloudSalary && !isSavingSalary) {
            return cloudSalary;
          }
          return prev;
        });
      }
      setIsSyncing(docSnap.metadata.hasPendingWrites || docSnap.metadata.fromCache);
    }, (error) => handleFirestoreError(error, OperationType.GET, settingsPath));

    // Listen to Expenses
    const expensesPath = `users/${user.uid}/expenses`;
    const expensesQuery = query(collection(db, expensesPath));
    const expensesUnsubscribe = onSnapshot(expensesQuery, (snapshot) => {
      const items: Expense[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as Expense);
      });
      setExpenses(items);
      setIsSyncing(snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache);
    }, (error) => handleFirestoreError(error, OperationType.GET, expensesPath));

    // Listen to Additional Salaries
    const additionalPath = `users/${user.uid}/additionalSalaries`;
    const additionalQuery = query(collection(db, additionalPath));
    const additionalUnsubscribe = onSnapshot(additionalQuery, (snapshot) => {
      const items: AdditionalSalary[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as AdditionalSalary);
      });
      setAdditionalSalaries(items);
      setIsSyncing(snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache);
    }, (error) => handleFirestoreError(error, OperationType.GET, additionalPath));

    return () => {
      settingsUnsubscribe();
      expensesUnsubscribe();
      additionalUnsubscribe();
    };
  }, [user]);

  const handleReorderExpenses = async (newOrder: Expense[]) => {
    setDisplayExpenses(newOrder);
    if (!user) return;
    
    const batch = writeBatch(db);
    let hasChanges = false;

    // Update Firestore with new orders
    for (let i = 0; i < newOrder.length; i++) {
      const item = newOrder[i];
      if (item.order !== i) {
        const path = `users/${user.uid}/expenses/${item.id}`;
        batch.update(doc(db, path), { order: i });
        hasChanges = true;
      }
    }

    if (hasChanges) {
      try {
        await batch.commit();
      } catch (error) {
        console.error("Error updating expense order:", error);
      }
    }
  };

  const handleReorderAdditionalSalaries = async (newOrder: AdditionalSalary[]) => {
    setDisplayAdditionalSalaries(newOrder);
    if (!user) return;

    const batch = writeBatch(db);
    let hasChanges = false;

    for (let i = 0; i < newOrder.length; i++) {
      const item = newOrder[i];
      if (item.order !== i) {
        const path = `users/${user.uid}/additionalSalaries/${item.id}`;
        batch.update(doc(db, path), { order: i });
        hasChanges = true;
      }
    }

    if (hasChanges) {
      try {
        await batch.commit();
      } catch (error) {
        console.error("Error updating salary order:", error);
      }
    }
  };

  // Firestore Operations
  const updateSalaryInCloud = async (newSalary: number) => {
    if (!user) return;
    setIsSavingSalary(true);
    const path = `users/${user.uid}/settings/main`;
    try {
      await setDoc(doc(db, path), { 
        salary: newSalary,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setIsSavingSalary(false);
    } catch (error) {
      setIsSavingSalary(false);
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleSalaryChange = (val: number) => {
    setSalary(val);
    
    if (salaryTimeout) {
      clearTimeout(salaryTimeout);
    }

    const timeout = setTimeout(() => {
      updateSalaryInCloud(val);
    }, 1000);
    
    setSalaryTimeout(timeout);
  };

  const handleAddExpense = async () => {
    if (!user) return;
    
    // Basic validation
    if (!formData.description.trim()) {
      setValidationError("A descrição é obrigatória.");
      return;
    }
    if (formData.value <= 0) {
      setValidationError("O valor deve ser maior que zero.");
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    console.log("Starting to save expense:", formData);
    
    const expenseData = {
      ...formData,
      uid: user.uid,
    };

    const basePath = `users/${user.uid}/expenses`;
    const maxOrder = Math.max(...filteredExpenses.map(e => e.order || 0), -1);
    const nextOrder = maxOrder + 1;

    try {
      if (editingExpense) {
        console.log("Editing existing expense:", editingExpense.id);
        if (editingExpense.isFixed || editingExpense.parentId || editingExpense.isRecurring) {
          setRecurringActionType("edit");
          setIsRecurringActionModalOpen(true);
          setIsSaving(false);
          return; // Stop here, the recurring modal will handle the rest
        } else {
          const path = `${basePath}/${editingExpense.id}`;
          await setDoc(doc(db, path), sanitizeData({
            ...expenseData,
            order: editingExpense.order ?? nextOrder
          }));
        }
      } else {
        console.log("Adding new expense");
        if (formData.isRecurring && formData.repeatCount > 1) {
          console.log("Creating recurring expenses:", formData.repeatCount);
          const parentId = crypto.randomUUID();
          const [y, m, d] = formData.date.split('-').map(Number);
          const baseDate = new Date(y, m - 1, d);

          const batch = writeBatch(db);
          for (let i = 0; i < formData.repeatCount; i++) {
            const nextDate = new Date(baseDate);
            if (formData.repeatFrequency === "monthly") {
              nextDate.setMonth(baseDate.getMonth() + i);
            } else {
              nextDate.setFullYear(baseDate.getFullYear() + i);
            }

            const ny = nextDate.getFullYear();
            const nm = String(nextDate.getMonth() + 1).padStart(2, '0');
            const nd = String(nextDate.getDate()).padStart(2, '0');

            const id = crypto.randomUUID();
            const path = `${basePath}/${id}`;
            batch.set(doc(db, path), sanitizeData({
              ...expenseData,
              date: `${ny}-${nm}-${nd}`,
              parentId: i === 0 ? null : parentId,
              order: nextOrder,
            }));
          }
          await batch.commit();
        } else {
          const id = crypto.randomUUID();
          const path = `${basePath}/${id}`;
          await setDoc(doc(db, path), sanitizeData({
            ...expenseData,
            order: nextOrder
          }));
        }
      }
      console.log("Expense saved successfully");
      setIsAddModalOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving expense:", error);
      handleFirestoreError(error, OperationType.WRITE, basePath);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteExpense = async () => {
    if (expenseToDelete && user) {
      const path = `users/${user.uid}/expenses/${expenseToDelete}`;
      try {
        await deleteDoc(doc(db, path));
        setExpenseToDelete(null);
        setIsDeleteConfirmModalOpen(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  };

  const handleRecurringAction = async (scope: "only-this" | "all-pending" | "all") => {
    if (!editingExpense || !recurringActionType || !user) return;

    setIsSaving(true);
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    const targetGroupId = editingExpense.parentId || editingExpense.id;
    const basePath = `users/${user.uid}/expenses`;

    try {
      if (recurringActionType === "edit") {
        const toUpdate = expenses.filter(e => {
          const isSameGroup = e.id === targetGroupId || e.parentId === targetGroupId || (editingExpense.isFixed && e.id === editingExpense.id);
          if (!isSameGroup) return false;
          if (scope === "only-this") return e.id === editingExpense.id;
          if (scope === "all-pending") return e.date.slice(0, 7) >= currentMonthStr && !e.isPaid;
          return true;
        });

        const batch = writeBatch(db);
        for (const e of toUpdate) {
          const path = `${basePath}/${e.id}`;
          const updatedData = sanitizeData({
            ...e,
            ...formData,
            uid: user.uid,
            date: e.date, // Keep original date
            parentId: e.parentId || null
          });
          batch.set(doc(db, path), updatedData);
        }
        await batch.commit();
      } else if (recurringActionType === "delete") {
        const toDelete = expenses.filter(e => {
          const isSameGroup = e.id === targetGroupId || e.parentId === targetGroupId || (editingExpense.isFixed && e.id === editingExpense.id);
          if (!isSameGroup) return false;
          if (scope === "only-this") return e.id === editingExpense.id;
          if (scope === "all-pending") return e.date.slice(0, 7) >= currentMonthStr && !e.isPaid;
          return true;
        });

        const batch = writeBatch(db);
        for (const e of toDelete) {
          const path = `${basePath}/${e.id}`;
          batch.delete(doc(db, path));
        }
        await batch.commit();
      }
      setIsRecurringActionModalOpen(false);
      setIsAddModalOpen(false);
      setRecurringActionType(null);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, basePath);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePaid = async (expense: Expense) => {
    if (!user) return;
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    const path = `users/${user.uid}/expenses/${expense.id}`;
    
    console.log(`Toggling paid status for ${expense.description} in month ${currentMonthStr}`);
    
    try {
      const expenseRef = doc(db, path);
      if (expense.isFixed) {
        const paidMonths = expense.paidMonths || [];
        const isPaid = paidMonths.includes(currentMonthStr);
        const newPaidMonths = isPaid 
          ? paidMonths.filter(m => m !== currentMonthStr)
          : [...paidMonths, currentMonthStr];
        await updateDoc(expenseRef, { paidMonths: newPaidMonths });
      } else {
        await updateDoc(expenseRef, { isPaid: !expense.isPaid });
      }
      console.log("Paid status updated successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleAddAdditionalSalary = async () => {
    if (!user) return;
    
    // Basic validation
    if (!additionalSalaryFormData.description.trim()) {
      setValidationError("A descrição é obrigatória.");
      return;
    }
    if (additionalSalaryFormData.value <= 0) {
      setValidationError("O valor deve ser maior que zero.");
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    const salaryData = {
      ...additionalSalaryFormData,
      uid: user.uid,
    };

    const basePath = `users/${user.uid}/additionalSalaries`;
    const maxOrder = Math.max(...additionalSalaries.map(s => s.order || 0), -1);
    const nextOrder = maxOrder + 1;

    try {
      if (editingAdditionalSalary) {
        const path = `${basePath}/${editingAdditionalSalary.id}`;
        await setDoc(doc(db, path), sanitizeData({
          ...salaryData,
          order: editingAdditionalSalary.order ?? nextOrder
        }));
      } else {
        const id = crypto.randomUUID();
        const path = `${basePath}/${id}`;
        await setDoc(doc(db, path), sanitizeData({
          ...salaryData,
          order: nextOrder
        }));
      }
      setIsAdditionalSalaryModalOpen(false);
      resetAdditionalSalaryForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, basePath);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteAdditionalSalary = async () => {
    if (additionalSalaryToDelete && user) {
      const path = `users/${user.uid}/additionalSalaries/${additionalSalaryToDelete}`;
      try {
        await deleteDoc(doc(db, path));
        setAdditionalSalaryToDelete(null);
        setIsDeleteAdditionalSalaryConfirmModalOpen(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  };

  // Helper to format date for display without timezone shifts
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    // Handle YYYY-MM-DD or ISO strings
    const datePart = dateStr.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
  };

  // Helper to get YYYY-MM-DD from any date string safely
  const toISODate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr.split('T')[0];
    
    // If it's just YYYY-MM-DD, return as is
    if (dateStr.length === 10 && dateStr.includes("-") && !dateStr.includes("T")) {
      return dateStr;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Form state for additional salary
  const [additionalSalaryFormData, setAdditionalSalaryFormData] = useState<{
    value: number;
    description: string;
    date: string;
  }>(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return {
      value: 0,
      description: "",
      date: today,
    };
  });

  // Form state
  const [formData, setFormData] = useState<{
    value: number;
    description: string;
    category: string;
    isFixed: boolean;
    isRecurring: boolean;
    repeatCount: number;
    repeatFrequency: "monthly" | "yearly";
    notes: string;
    date: string;
  }>(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return {
      value: 0,
      description: "",
      category: DEFAULT_CATEGORIES[0],
      isFixed: false,
      isRecurring: false,
      repeatCount: 1,
      repeatFrequency: "monthly",
      notes: "",
      date: today,
    };
  });

  const filteredExpenses = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const currentMonthStr = `${year}-${month}`;
    const result: Expense[] = [];

    expenses.forEach(expense => {
      const expenseMonthStr = expense.date.slice(0, 7);

      if (expense.isFixed) {
        // Show if it started on or before this month
        if (expenseMonthStr <= currentMonthStr) {
          // Create a virtual instance for this month
          result.push({
            ...expense,
            // Override date for display to match the current month being viewed
            // but keep the day from the original date
            date: `${currentMonthStr}-${expense.date.slice(8, 10)}`,
            isPaid: expense.paidMonths?.includes(currentMonthStr) || false
          });
        }
      } else {
        // Normal or generated recurring items
        if (expenseMonthStr === currentMonthStr) {
          result.push(expense);
        }
      }
    });

    // Sort by order if available, otherwise by date
    return result.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [expenses, currentDate]);

  const filteredAdditionalSalaries = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const currentMonthStr = `${year}-${month}`;
    const result = additionalSalaries.filter(salary => salary.date.slice(0, 7) === currentMonthStr);
    
    // Sort by order if available, otherwise by date
    return result.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [additionalSalaries, currentDate]);

  // Sync display states with filtered lists
  useEffect(() => {
    setDisplayExpenses(filteredExpenses);
  }, [filteredExpenses]);

  useEffect(() => {
    // For the management list, we show ALL additional salaries sorted by date descending
    const sortedAll = [...additionalSalaries].sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    setDisplayAdditionalSalaries(sortedAll);
  }, [additionalSalaries]);

  const totalMonthlyExpenses = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + curr.value, 0);
  }, [filteredExpenses]);

  const totalAdditionalSalary = useMemo(() => {
    return filteredAdditionalSalaries.reduce((acc, curr) => acc + curr.value, 0);
  }, [filteredAdditionalSalaries]);

  const totalIncome = salary + totalAdditionalSalary;
  const balance = totalIncome - totalMonthlyExpenses;

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      value: expense.value,
      description: expense.description,
      category: expense.category,
      isFixed: expense.isFixed,
      isRecurring: expense.isRecurring,
      repeatCount: expense.repeatCount || 1,
      repeatFrequency: expense.repeatFrequency || "monthly",
      notes: expense.notes,
      date: toISODate(expense.date),
    });
    setIsAddModalOpen(true);
  };

  const handleDeleteExpense = (id: string) => {
    const expense = expenses.find(e => e.id === id);
    if (expense && (expense.isFixed || expense.parentId || expense.isRecurring)) {
      setEditingExpense(expense);
      setRecurringActionType("delete");
      setIsRecurringActionModalOpen(true);
    } else {
      setExpenseToDelete(id);
      setIsDeleteConfirmModalOpen(true);
    }
  };

  const handleEditAdditionalSalary = (salary: AdditionalSalary) => {
    setEditingAdditionalSalary(salary);
    setAdditionalSalaryFormData({
      value: salary.value,
      description: salary.description,
      date: toISODate(salary.date),
    });
    setIsAdditionalSalaryModalOpen(true);
  };

  const handleDeleteAdditionalSalary = (id: string) => {
    setAdditionalSalaryToDelete(id);
    setIsDeleteAdditionalSalaryConfirmModalOpen(true);
  };

  const resetAdditionalSalaryForm = () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setAdditionalSalaryFormData({
      value: 0,
      description: "",
      date: today,
    });
    setEditingAdditionalSalary(null);
    setValidationError(null);
  };

  const handleAddCategory = () => {
    if (newCategory && !categories.includes(newCategory)) {
      setCategories([...categories, newCategory]);
      setNewCategory("");
      setIsCategoryModalOpen(false);
    }
  };

  const resetForm = () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setFormData({
      value: 0,
      description: "",
      category: categories[0] || DEFAULT_CATEGORIES[0],
      isFixed: false,
      isRecurring: false,
      repeatCount: 1,
      repeatFrequency: "monthly",
      notes: "",
      date: today,
    });
    setEditingExpense(null);
    setValidationError(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const changeMonth = (offset: number) => {
    const nextDate = new Date(currentDate);
    nextDate.setMonth(currentDate.getMonth() + offset);
    setCurrentDate(nextDate);
  };

  const monthName = currentDate.toLocaleString("pt-BR", { month: "long" });
  const year = currentDate.getFullYear();

  // Report Data Calculations
  const reportData = useMemo(() => {
    const start = new Date(reportRange.start + "-01");
    const end = new Date(reportRange.end + "-01");
    end.setMonth(end.getMonth() + 1); // Include the end month fully

    const periodExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d >= start && d < end;
    });

    const periodAdditionalSalaries = additionalSalaries.filter(s => {
      const d = new Date(s.date);
      return d >= start && d < end;
    });

    // Monthly Comparison Data
    const monthlyData: any[] = [];
    let tempDate = new Date(start);
    while (tempDate < end) {
      const mStr = `${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, '0')}`;
      const mLabel = tempDate.toLocaleString("pt-BR", { month: "short", year: "2-digit" });
      
      const mExpenses = expenses.filter(e => {
        if (e.isFixed) {
          return e.date.slice(0, 7) <= mStr;
        }
        return e.date.slice(0, 7) === mStr;
      }).reduce((acc, curr) => acc + curr.value, 0);

      const mAdditional = additionalSalaries.filter(s => s.date.slice(0, 7) === mStr)
        .reduce((acc, curr) => acc + curr.value, 0);

      monthlyData.push({
        name: mLabel,
        despesas: mExpenses,
        rendimentos: salary + mAdditional,
        extra: mAdditional
      });

      tempDate.setMonth(tempDate.getMonth() + 1);
    }

    // Category Data
    const categoryTotals: Record<string, number> = {};
    periodExpenses.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.value;
    });

    const pieData = Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const COLORS = ['#4ade80', '#60a5fa', '#f87171', '#fbbf24', '#a78bfa', '#f472b6', '#2dd4bf', '#fb923c'];

    return { monthlyData, pieData, COLORS, periodAdditionalSalaries };
  }, [expenses, additionalSalaries, salary, reportRange]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#144a95] to-[#628cc0] text-white p-4 md:p-8 font-sans">
      <div className="max-w-3xl mx-auto w-full space-y-6 pb-24">
        {/* Auth Loading State */}
        {!isAuthReady ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-white/60 font-medium">Carregando...</p>
          </div>
        ) : !user ? (
          /* Login Screen */
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center min-h-[80vh] space-y-8 text-center"
          >
            <div className="space-y-4">
              <div className="bg-white/20 p-6 rounded-3xl backdrop-blur-md inline-block mx-auto">
                <Wallet className="w-16 h-16 text-white" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight">Finanzo</h1>
              <p className="text-white/70 max-w-xs mx-auto">
                Seu controle financeiro inteligente, sincronizado em todos os seus dispositivos.
              </p>
            </div>
            
            <Button 
              onClick={signInWithGoogle}
              className="bg-white text-[#144a95] hover:bg-white/90 font-bold px-8 py-6 rounded-2xl text-lg shadow-2xl flex items-center gap-3 transition-all hover:scale-105"
            >
              <LogIn className="w-6 h-6" />
              Entrar com Google
            </Button>
            
            <div className="text-xs text-white/40 max-w-[200px]">
              Ao entrar, seus dados serão salvos com segurança na nuvem.
            </div>
          </motion.div>
        ) : (
          /* Main App Content */
          <>
            {/* Header */}
            <motion.header 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-between items-center"
            >
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl font-bold tracking-tight">Finanzo</h1>
                      {user && (
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          isSyncing ? "bg-yellow-400 animate-pulse" : "bg-green-400"
                        )} title={isSyncing ? "Sincronizando..." : "Sincronizado"} />
                      )}
                    </div>
                    {user && (
                      <p className="text-[10px] text-white/40 font-medium truncate max-w-[120px]">
                        {user.email}
                      </p>
                    )}
                  </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-white/10 backdrop-blur-md p-1 rounded-xl border border-white/10">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setActiveTab("home")}
                    className={cn("rounded-lg px-4 h-8 text-xs font-bold transition-all", activeTab === "home" ? "bg-white text-[#144a95] shadow-lg" : "text-white/60 hover:text-white")}
                  >
                    <Home className="w-3.5 h-3.5 mr-1.5" />
                    Início
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setActiveTab("report")}
                    className={cn("rounded-lg px-4 h-8 text-xs font-bold transition-all", activeTab === "report" ? "bg-white text-[#144a95] shadow-lg" : "text-white/60 hover:text-white")}
                  >
                    <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                    Relatório
                  </Button>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={logout}
                  className="h-10 w-10 rounded-xl bg-white/10 text-white hover:bg-red-500/20 hover:text-red-200"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </motion.header>

            {activeTab === "home" ? (
              <>
                {/* Salary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 shadow-xl"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor="salary" className="text-white/70 text-[10px] uppercase font-bold block tracking-wider">Meu Salário</Label>
                      {isSavingSalary && (
                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/50 text-xl font-bold shrink-0">R$</span>
                      <Input
                        id="salary"
                        type="number"
                        value={salary || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleSalaryChange(val);
                        }}
                        className="bg-transparent border-none text-3xl font-bold text-white focus-visible:ring-0 h-auto p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-full"
                        placeholder="0,00"
                      />
                    </div>
                  </motion.div>

              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 shadow-xl flex flex-col cursor-pointer hover:bg-white/15 transition-colors"
                onClick={() => setIsAdditionalSalaryListModalOpen(true)}
              >
                <div className="flex justify-between items-start mb-2">
                  <Label className="text-white/70 text-[10px] uppercase font-bold block tracking-wider cursor-pointer">Salário Adicional</Label>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={(e) => { e.stopPropagation(); resetAdditionalSalaryForm(); setIsAdditionalSalaryModalOpen(true); }}
                    className="h-6 w-6 rounded-full bg-white/10 text-white hover:bg-white/20"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-white/50 text-lg font-bold">R$</span>
                  <span className="text-3xl font-bold text-white">{totalAdditionalSalary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="mt-2 text-[8px] text-white/40 flex items-center gap-1">
                  <ChevronRight className="w-2 h-2" />
                  Clique para ver detalhes
                </div>
              </motion.div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
                <Card className="bg-white/10 backdrop-blur-md border-white/20 text-white overflow-hidden relative p-4">
                  <div className="absolute top-0 right-0 p-2 opacity-10">
                    <ArrowUpCircle className="w-10 h-10" />
                  </div>
                  <div className="text-[10px] font-bold text-white/70 uppercase mb-1 tracking-wider">Rendimentos</div>
                  <div className="text-xl font-bold">{formatCurrency(totalIncome)}</div>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
                <Card className="bg-white/10 backdrop-blur-md border-white/20 text-white overflow-hidden relative p-4">
                  <div className="absolute top-0 right-0 p-2 opacity-10">
                    <ArrowDownCircle className="w-10 h-10" />
                  </div>
                  <div className="text-[10px] font-bold text-white/70 uppercase mb-1 tracking-wider">Despesas</div>
                  <div className="text-xl font-bold text-red-300">{formatCurrency(totalMonthlyExpenses)}</div>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
                <Card className="bg-white/10 backdrop-blur-md border-white/20 text-white overflow-hidden relative p-4">
                  <div className="absolute top-0 right-0 p-2 opacity-10">
                    <Wallet className="w-10 h-10" />
                  </div>
                  <div className="text-[10px] font-bold text-white/70 uppercase mb-1 tracking-wider">Saldo</div>
                  <div className={cn("text-xl font-bold", balance >= 0 ? "text-green-300" : "text-red-400")}>
                    {formatCurrency(balance)}
                  </div>
                </Card>
              </motion.div>
            </div>

            {/* Month Selector */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="flex items-center justify-center gap-4 bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20"
            >
              <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)} className="text-white hover:bg-white/10">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="text-center min-w-[160px]">
                <div className="text-xs uppercase font-bold text-white/50 tracking-widest">{year}</div>
                <div className="text-xl font-bold capitalize">{monthName}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => changeMonth(1)} className="text-white hover:bg-white/10">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </motion.div>

            {/* Expenses List */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h2 className="text-xl font-bold">Despesas de {monthName}</h2>
                <Badge variant="outline" className="text-white border-white/30">
                  {filteredExpenses.length} itens
                </Badge>
              </div>
              
              <div className="p-6">
                <div className="space-y-4">
                  <AnimatePresence mode="popLayout">
                    {displayExpenses.length === 0 ? (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12 text-white/50"
                      >
                        Nenhuma despesa para este mês.
                      </motion.div>
                    ) : (
                      <Reorder.Group 
                        axis="y" 
                        values={displayExpenses} 
                        onReorder={handleReorderExpenses}
                        className="space-y-3"
                      >
                        {displayExpenses.map((expense) => (
                          <ExpenseItem
                            key={`${expense.id}-${currentDate.toISOString().slice(0, 7)}`}
                            expense={expense}
                            currentMonthStr={currentDate.toISOString().slice(0, 7)}
                            onTogglePaid={handleTogglePaid}
                            onEdit={handleEditExpense}
                            onDelete={handleDeleteExpense}
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                          />
                        ))}
                      </Reorder.Group>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Report Controls */}
            <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 shadow-xl space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <h2 className="text-xl font-bold">Configuração do Relatório</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-white/60 uppercase font-bold">Mês Inicial</Label>
                  <Input 
                    type="month" 
                    value={reportRange.start}
                    onChange={(e) => setReportRange({ ...reportRange, start: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-white/60 uppercase font-bold">Mês Final</Label>
                  <Input 
                    type="month" 
                    value={reportRange.end}
                    onChange={(e) => setReportRange({ ...reportRange, end: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Monthly Comparison Chart */}
            <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 shadow-xl">
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-bold">Comparativo Mensal</h2>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportData.monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="rgba(255,255,255,0.5)" 
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="rgba(255,255,255,0.5)" 
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `R$ ${value}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#144a95', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px' }}
                      itemStyle={{ fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '10px' }} />
                    <Bar dataKey="rendimentos" name="Rendimentos" fill="#4ade80" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" name="Despesas" fill="#f87171" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Category Breakdown */}
              <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 shadow-xl">
                <div className="flex items-center gap-2 mb-6">
                  <PieChart className="w-5 h-5 text-purple-400" />
                  <h2 className="text-lg font-bold">Gastos por Categoria</h2>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={reportData.pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {reportData.pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={reportData.COLORS[index % reportData.COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#144a95', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px' }}
                        itemStyle={{ fontSize: '12px' }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {reportData.pieData.slice(0, 4).map((item, index) => (
                    <div key={item.name} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: reportData.COLORS[index % reportData.COLORS.length] }} />
                        <span className="text-white/70">{item.name}</span>
                      </div>
                      <span className="font-bold">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Salaries Period List */}
              <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 shadow-xl flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <ArrowUpCircle className="w-5 h-5 text-green-400" />
                  <h2 className="text-lg font-bold">Extras no Período</h2>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                  {reportData.periodAdditionalSalaries.length > 0 ? (
                    reportData.periodAdditionalSalaries
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(s => (
                      <div key={s.id} className="bg-white/5 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
                        <div>
                          <div className="text-sm font-bold">{s.description}</div>
                          <div className="text-[10px] text-white/40">{formatDate(s.date)}</div>
                        </div>
                        <div className="text-sm font-bold text-green-300">{formatCurrency(s.value)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-white/30 italic text-sm">
                      Nenhum extra neste período.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Navigation Bar (Mobile Friendly) */}
        {user && (
          <div className="fixed bottom-0 left-0 right-0 p-4 flex justify-center z-40">
            <div className="bg-[#144a95]/80 backdrop-blur-xl border border-white/20 rounded-full p-2 flex items-center gap-2 shadow-2xl">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setActiveTab("home")}
                className={cn("w-12 h-12 rounded-full transition-all", activeTab === "home" ? "bg-white text-[#144a95]" : "text-white/60")}
              >
                <Home className="w-6 h-6" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setActiveTab("report")}
                className={cn("w-12 h-12 rounded-full transition-all", activeTab === "report" ? "bg-white text-[#144a95]" : "text-white/60")}
              >
                <BarChart3 className="w-6 h-6" />
              </Button>
              <div className="w-px h-6 bg-white/20 mx-1" />
              <Button 
                onClick={() => { resetForm(); setIsAddModalOpen(true); }}
                className="w-12 h-12 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition-all"
              >
                <Plus className="w-6 h-6" />
              </Button>
            </div>
          </div>
        )}
      </>
    )}
  </div>

      {/* Add/Edit Expense Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="bg-[#144a95] border-white/20 text-white sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingExpense ? "Editar Despesa" : "Nova Despesa"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="date" className="text-white/70">Data da Despesa</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="bg-white/10 border-white/20 text-white pl-10"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="value" className="text-white/70">Valor (R$)</Label>
              <Input
                id="value"
                type="number"
                value={formData.value || ""}
                onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description" className="text-white/70">Descrição</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                placeholder="Ex: Aluguel, Netflix..."
              />
            </div>
            <div className="grid gap-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="category" className="text-white/70">Categoria</Label>
                <Button 
                  variant="link" 
                  className="text-white/50 hover:text-white h-auto p-0 text-xs"
                  onClick={() => setIsCategoryModalOpen(true)}
                >
                  + Nova Categoria
                </Button>
              </div>
              <Select 
                value={formData.category} 
                onValueChange={(v) => setFormData({ ...formData, category: v })}
              >
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent className="bg-[#144a95] border-white/20 text-white">
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat} className="focus:bg-white/10 focus:text-white">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="fixed" 
                    checked={formData.isFixed}
                    onCheckedChange={(checked) => setFormData({ ...formData, isFixed: !!checked })}
                    className="border-white/30 data-[state=checked]:bg-white data-[state=checked]:text-[#144a95]"
                  />
                  <Label htmlFor="fixed" className="text-sm font-medium leading-none">
                    Despesa Fixa
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="recurring" 
                    checked={formData.isRecurring}
                    onCheckedChange={(checked) => setFormData({ ...formData, isRecurring: !!checked })}
                    className="border-white/30 data-[state=checked]:bg-white data-[state=checked]:text-[#144a95]"
                  />
                  <Label htmlFor="recurring" className="text-sm font-medium leading-none">
                    Repetir
                  </Label>
                </div>
              </div>

              {formData.isRecurring && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10"
                >
                  <div className="grid gap-2">
                    <Label htmlFor="repeatCount" className="text-xs text-white/50">Vezes</Label>
                    <Input
                      id="repeatCount"
                      type="number"
                      min="1"
                      value={formData.repeatCount}
                      onChange={(e) => setFormData({ ...formData, repeatCount: parseInt(e.target.value) || 1 })}
                      className="bg-white/10 border-white/20 text-white h-8"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="frequency" className="text-xs text-white/50">Frequência</Label>
                    <Select 
                      value={formData.repeatFrequency} 
                      onValueChange={(v: "monthly" | "yearly") => setFormData({ ...formData, repeatFrequency: v })}
                    >
                      <SelectTrigger className="bg-white/10 border-white/20 text-white h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#144a95] border-white/20 text-white">
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="yearly">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes" className="text-white/70">Observação</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                placeholder="Opcional..."
              />
            </div>
          </div>
          {validationError && (
            <div className="px-6 pb-2">
              <div className="bg-red-500/20 border border-red-500/50 p-3 rounded-xl flex items-center gap-2 text-red-200 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {validationError}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button 
              onClick={handleAddExpense}
              disabled={isSaving}
              className="w-full bg-white text-[#144a95] hover:bg-white/90 font-bold"
            >
              {isSaving ? "Salvando..." : (editingExpense ? "Efetivar Alteração" : "Efetivar Despesa")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Additional Salary Modal */}
      <Dialog open={isAdditionalSalaryModalOpen} onOpenChange={setIsAdditionalSalaryModalOpen}>
        <DialogContent className="bg-[#144a95] border-white/20 text-white sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingAdditionalSalary ? "Editar Salário Adicional" : "Novo Salário Adicional"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="add-salary-date" className="text-white/70">Data</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <Input
                  id="add-salary-date"
                  type="date"
                  value={additionalSalaryFormData.date}
                  onChange={(e) => setAdditionalSalaryFormData({ ...additionalSalaryFormData, date: e.target.value })}
                  className="bg-white/10 border-white/20 text-white pl-10"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-salary-value" className="text-white/70">Valor (R$)</Label>
              <Input
                id="add-salary-value"
                type="number"
                value={additionalSalaryFormData.value || ""}
                onChange={(e) => setAdditionalSalaryFormData({ ...additionalSalaryFormData, value: parseFloat(e.target.value) || 0 })}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-salary-description" className="text-white/70">Descrição</Label>
              <Input
                id="add-salary-description"
                value={additionalSalaryFormData.description}
                onChange={(e) => setAdditionalSalaryFormData({ ...additionalSalaryFormData, description: e.target.value })}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                placeholder="Ex: Freelance, Venda..."
              />
            </div>
          </div>
          {validationError && (
            <div className="px-6 pb-2">
              <div className="bg-red-500/20 border border-red-500/50 p-3 rounded-xl flex items-center gap-2 text-red-200 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {validationError}
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            {editingAdditionalSalary && (
              <Button 
                variant="destructive"
                onClick={() => {
                  handleDeleteAdditionalSalary(editingAdditionalSalary.id);
                  setIsAdditionalSalaryModalOpen(false);
                }}
                className="bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/50"
              >
                Excluir
              </Button>
            )}
            <Button 
              onClick={handleAddAdditionalSalary}
              disabled={isSaving}
              className="flex-1 bg-white text-[#144a95] hover:bg-white/90 font-bold"
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recurring Action Confirmation Modal */}
      <Dialog open={isRecurringActionModalOpen} onOpenChange={setIsRecurringActionModalOpen}>
        <DialogContent className="bg-[#144a95] border-white/20 text-white sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {recurringActionType === "edit" ? "Confirmar Alteração" : "Confirmar Exclusão"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-white/70">
              Esta é uma despesa recorrente ou fixa. Como você deseja prosseguir?
            </p>
            <div className="grid gap-3">
              <Button 
                variant="outline" 
                className="justify-start border-white/20 hover:bg-white/20 text-white bg-white/5"
                onClick={() => handleRecurringAction("only-this")}
                disabled={isSaving}
              >
                {recurringActionType === "edit" ? "Alterar somente esta" : "Excluir somente esta"}
              </Button>
              <Button 
                variant="outline" 
                className="justify-start border-white/20 hover:bg-white/20 text-white bg-white/5"
                onClick={() => handleRecurringAction("all-pending")}
                disabled={isSaving}
              >
                {recurringActionType === "edit" ? "Alterar todas pendentes" : "Excluir todas pendentes"}
              </Button>
              <Button 
                variant="outline" 
                className="justify-start border-white/20 hover:bg-white/20 text-white bg-white/5"
                onClick={() => handleRecurringAction("all")}
                disabled={isSaving}
              >
                {recurringActionType === "edit" ? "Alterar todas (incluindo efetivadas)" : "Excluir todas (incluindo efetivadas)"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="ghost" 
              onClick={() => {
                setIsRecurringActionModalOpen(false);
                setRecurringActionType(null);
              }}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Additional Salary Confirmation Modal */}
      <Dialog open={isDeleteAdditionalSalaryConfirmModalOpen} onOpenChange={setIsDeleteAdditionalSalaryConfirmModalOpen}>
        <DialogContent className="bg-[#144a95] border-white/20 text-white sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-white/70">
              Tem certeza que deseja excluir este salário adicional? Esta ação não pode ser desfeita.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="ghost" 
              onClick={() => setIsDeleteAdditionalSalaryConfirmModalOpen(false)}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteAdditionalSalary}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Additional Salary List Modal */}
      <Dialog open={isAdditionalSalaryListModalOpen} onOpenChange={setIsAdditionalSalaryListModalOpen}>
        <DialogContent className="bg-[#144a95] border-white/20 text-white sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5 text-green-400" />
              Salários Adicionais - {monthName}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 mb-4 flex justify-between items-center">
              <span className="text-sm text-white/70 uppercase font-bold tracking-wider">Total do Mês</span>
              <span className="text-2xl font-bold text-green-400">{formatCurrency(totalAdditionalSalary)}</span>
            </div>
            
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {displayAdditionalSalaries.length > 0 ? (
                <Reorder.Group 
                  axis="y" 
                  values={displayAdditionalSalaries} 
                  onReorder={handleReorderAdditionalSalaries}
                  className="space-y-3"
                >
                  {displayAdditionalSalaries.map(s => (
                    <AdditionalSalaryItem
                      key={s.id}
                      salary={s}
                      onEdit={(salary) => { setIsAdditionalSalaryListModalOpen(false); handleEditAdditionalSalary(salary); }}
                      onDelete={handleDeleteAdditionalSalary}
                      formatCurrency={formatCurrency}
                      formatDate={formatDate}
                    />
                  ))}
                </Reorder.Group>
              ) : (
                <div className="text-center py-8 text-white/30 italic">
                  Nenhum salário adicional registrado para este mês.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button 
              className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/10"
              onClick={() => {
                setIsAdditionalSalaryListModalOpen(false);
                resetAdditionalSalaryForm();
                setIsAdditionalSalaryModalOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Novo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteConfirmModalOpen} onOpenChange={setIsDeleteConfirmModalOpen}>
        <DialogContent className="bg-[#144a95] border-white/20 text-white sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-white/70">
              Tem certeza que deseja excluir esta despesa? Esta ação não pode ser desfeita.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="ghost" 
              onClick={() => setIsDeleteConfirmModalOpen(false)}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteExpense}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Category Modal */}
      <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
        <DialogContent className="bg-[#144a95] border-white/20 text-white sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="bg-white/10 border-white/20 text-white"
              placeholder="Nome da categoria"
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
            />
          </div>
          <DialogFooter>
            <Button 
              onClick={handleAddCategory}
              className="w-full bg-white text-[#144a95] hover:bg-white/90"
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
