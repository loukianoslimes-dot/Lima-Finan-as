import React, { useState, useEffect, useMemo } from "react";
import { registerSW } from 'virtual:pwa-register';
import { Plus, Trash2, Edit2, Wallet, ArrowUpCircle, ArrowDownCircle, ChevronLeft, ChevronRight, ChevronDown, Calendar as CalendarIcon, BarChart3, Home, PieChart, TrendingUp, LogOut, LogIn, AlertCircle, GripVertical, Share2, Copy, Check, Download, Camera, Target, User as UserIcon, UserPlus, Banknote, X, Settings, Minus, ShieldAlert, RefreshCw, CheckCheck, CheckCircle, ShieldCheck, XCircle, Star, MessageSquare, Palette } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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
  User,
  updateProfile
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
import { formatCurrencyParts, generateId, addMonths, addYears, formatDateToISO, formatCurrencyInput, parseCurrencyInput } from "./utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  dueDate?: string; // ISO string
  parentId?: string; // To group recurring expenses
  isPaid?: boolean;
  paidMonths?: string[]; // For fixed expenses: ["YYYY-MM", ...]
  order?: number;
  installmentIndex?: number;
}

interface AdditionalSalary {
  id: string;
  value: number;
  description: string;
  date: string; // ISO string
  order?: number;
  debtorId?: string; // ID of the debtor if it came from a settled debtor
}

interface Debtor {
  id: string;
  value: number;
  description: string;
  isFixed: boolean;
  isRecurring: boolean;
  repeatCount?: number;
  repeatFrequency?: "monthly" | "yearly";
  notes: string;
  date: string; // ISO string
  parentId?: string;
  isReceived?: boolean;
  receivedMonths?: string[];
  order?: number;
  installmentIndex?: number;
  addedToExtras?: boolean;
  addedToExtraMonths?: string[];
  category?: string;
}

interface UndoState {
  type: 'delete' | 'edit' | 'add';
  entity: 'expense' | 'debtor' | 'additionalSalary';
  data: any | any[];
  timestamp: number;
}

type BulkActionType = 'single' | 'pending' | 'effective' | 'current_plus_pending' | 'current_plus_effective';

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

interface Tribute {
  id: string;
  name: string;
  percentage: number;
  base: 'total' | 'main';
  enabled: boolean;
}

interface AppUser {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'active' | 'rejected';
  createdAt: string;
}

// Main App Component
interface DebtorItemProps {
  debtor: Debtor;
  currentMonthStr: string;
  onToggleReceived: (debtor: Debtor) => void | Promise<void>;
  onEdit: (debtor: Debtor) => void;
  onDelete: (id: string) => void;
  formatCurrency: (val: number) => string;
  formatDate: (dateStr: string) => string;
  installmentInfo?: string;
}

const DebtorItem: React.FC<DebtorItemProps> = ({ 
  debtor, 
  currentMonthStr, 
  onToggleReceived, 
  onEdit, 
  onDelete, 
  formatCurrency, 
  formatDate,
  installmentInfo
}) => {
  const { symbol, amount } = formatCurrencyParts(debtor.value);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "group bg-white/5 hover:bg-white/10 backdrop-blur-md transition-colors p-4 rounded-2xl border border-white/10 flex items-center justify-between gap-4",
        debtor.isReceived 
          ? "bg-green-500/20 border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.1)]" 
          : "animate-blink-red"
      )}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Checkbox 
            checked={!!debtor.isReceived}
            onCheckedChange={() => onToggleReceived(debtor)}
            className="border-white/30 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={cn("font-bold truncate", debtor.isReceived && "text-green-100")}>
              {debtor.description}
            </h3>
            {debtor.isReceived ? (
              <Badge className="bg-green-500 text-[10px] h-4 px-1 text-white">Recebido</Badge>
            ) : (
              <Badge variant="outline" className="border-white/20 text-white/40 text-[10px] h-4 px-1">Pendente</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60">
            {debtor.category && (
              <span className={cn("bg-white/10 px-2 py-0.5 rounded-full", debtor.isReceived && "bg-green-500/20 text-green-200")}>{debtor.category}</span>
            )}
            <span>{formatDate(debtor.date)}</span>
          </div>
          {debtor.notes && <p className={cn("text-xs text-white/40 mt-1 italic", debtor.isReceived && "text-green-200/40")}>{debtor.notes}</p>}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 shrink-0 px-2 min-w-[70px]">
        {debtor.isFixed && <Badge className="bg-blue-500/50 text-[10px] h-4 px-1">Fixa</Badge>}
        {debtor.isRecurring && (
          <Badge className="bg-purple-500/50 text-[10px] h-4 px-1 text-center">
            Recorrente {installmentInfo && <span className="block text-[8px] opacity-80">({installmentInfo})</span>}
          </Badge>
        )}
      </div>
      
      <div className="flex items-center gap-4 ml-auto" onPointerDown={(e) => e.stopPropagation()}>
        <div className="text-right shrink-0">
          <div className={cn("font-bold flex items-baseline gap-1", debtor.isReceived ? "text-green-300" : "text-white")}>
            <span className="text-[10px] opacity-50">{symbol}</span>
            <span className="text-lg whitespace-nowrap">{amount}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => onEdit(debtor)}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/20"
            onClick={() => onDelete(debtor.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

interface ExpenseItemProps {
  expense: Expense;
  currentMonthStr: string;
  onTogglePaid: (expense: Expense) => void | Promise<void>;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  formatCurrency: (val: number) => string;
  formatDate: (dateStr: string) => string;
  installmentInfo?: string;
}

const ExpenseItem: React.FC<ExpenseItemProps> = ({ 
  expense, 
  currentMonthStr, 
  onTogglePaid, 
  onEdit, 
  onDelete, 
  formatCurrency, 
  formatDate,
  installmentInfo
}) => {
  const { symbol, amount } = formatCurrencyParts(expense.value);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "group bg-white/5 hover:bg-white/10 backdrop-blur-md transition-colors p-4 rounded-2xl border border-white/10 flex items-center justify-between gap-4",
        expense.isPaid && "bg-green-500/20 border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.1)]"
      )}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Checkbox 
            checked={!!expense.isPaid}
            onCheckedChange={() => onTogglePaid(expense)}
            className="border-white/30 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={cn("font-bold truncate", expense.isPaid && "text-green-100")}>
              {expense.description}
            </h3>
            {expense.isPaid ? (
              <Badge className="bg-green-500 text-[10px] h-4 px-1 text-white flex items-center gap-1">
                <Check className="w-2.5 h-2.5" />
                Pago
              </Badge>
            ) : (
              <Badge variant="outline" className="border-white/20 text-white/40 text-[10px] h-4 px-1 flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5" />
                Pendente
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span className={cn("bg-white/10 px-2 py-0.5 rounded-full", expense.isPaid && "bg-green-500/20 text-green-200")}>{expense.category}</span>
            <span>•</span>
            <span>{formatDate(expense.date)}</span>
            {expense.dueDate && (
              <>
                <span>•</span>
                <span className="text-yellow-400/80">Venc: {formatDate(expense.dueDate)}</span>
              </>
            )}
          </div>
          {expense.notes && <p className={cn("text-xs text-white/40 mt-1 italic", expense.isPaid && "text-green-200/40")}>{expense.notes}</p>}
        </div>
      </div>

      {/* Indicadores no centro */}
      <div className="flex flex-col items-center gap-1 shrink-0 px-2 min-w-[70px]">
        {expense.isFixed && <Badge className="bg-blue-500/50 text-[10px] h-4 px-1">Fixa</Badge>}
        {expense.isRecurring && (
          <Badge className="bg-purple-500/50 text-[10px] h-4 px-1 text-center">
            Recorrente {installmentInfo && <span className="block text-[8px] opacity-80">({installmentInfo})</span>}
          </Badge>
        )}
      </div>
      
      <div className="flex items-center gap-4 ml-auto" onPointerDown={(e) => e.stopPropagation()}>
        <div className="text-right shrink-0">
          <div className={cn("font-bold flex items-baseline gap-1", expense.isPaid ? "text-green-300" : "text-white")}>
            <span className="text-[10px] opacity-50">{symbol}</span>
            <span className="text-lg whitespace-nowrap">{amount}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => onEdit(expense)}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/20"
            onClick={() => onDelete(expense.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

interface AdditionalSalaryItemProps {
  salary: AdditionalSalary;
  onEdit: (salary: AdditionalSalary) => void;
  onDelete: (id: string) => void;
  formatCurrency: (val: number) => string;
  formatDate: (dateStr: string) => string;
  onViewDebtorInfo?: (debtorId: string) => void;
}

const AdditionalSalaryItem: React.FC<AdditionalSalaryItemProps> = ({ 
  salary, 
  onEdit, 
  onDelete, 
  formatCurrency, 
  formatDate,
  onViewDebtorInfo
}) => {
  const { symbol, amount } = formatCurrencyParts(salary.value);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group bg-white/5 hover:bg-white/10 p-3 rounded-2xl transition-colors border border-white/10 flex items-center gap-4"
    >
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(salary)}>
        <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
          Rendimento Extra
          {salary.debtorId && (
            <span 
              className="text-blue-300 hover:text-blue-200 underline cursor-pointer normal-case bg-blue-500/10 px-2 py-0.5 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onViewDebtorInfo?.(salary.debtorId!);
              }}
            >
              (lançado dos devedores)
            </span>
          )}
        </div>
        <div className="font-bold text-white truncate">{salary.description}</div>
        <div className="text-[10px] text-white/30 mt-0.5">
          {formatDate(salary.date)}
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto shrink-0">
        <div className="text-right">
          <div className="font-bold text-green-300 flex items-baseline gap-1">
            <span className="text-[10px] opacity-50">{symbol}</span>
            <span className="text-base sm:text-lg whitespace-nowrap">{amount}</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); onEdit(salary); }}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={(e) => { e.stopPropagation(); onDelete(salary.id); }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

interface AppUpdateInfo {
  title: string;
  version: string;
  changelog: string;
  isMandatory: boolean;
  updatedAt: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [appUserStatus, setAppUserStatus] = useState<AppUser['status']>('pending');
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [allAppUsers, setAllAppUsers] = useState<AppUser[]>([]);
  const isAdmin = user?.email === "loukianoslimes@gmail.com";

  // --- PWA Update Flow ---
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSWFn, setUpdateSWFn] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        console.log('App is ready to work offline');
      },
    });
    setUpdateSWFn(() => updateSW);
  }, []);
  // -------------------------

  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);
  useEffect(() => {
    const updatePath = "systemSettings/appUpdate";
    const unsubscribe = onSnapshot(doc(db, updatePath), (docSnap) => {
      if (docSnap.exists()) {
        setAppUpdateInfo(docSnap.data() as AppUpdateInfo);
      }
    });
    return () => unsubscribe();
  }, []);

  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [isSavingSalary, setIsSavingSalary] = useState(false);
  const [salaryTimeout, setSalaryTimeout] = useState<NodeJS.Timeout | null>(null);

  const [salary, setSalary] = useState<number>(0);
  const [secondarySalary, setSecondarySalary] = useState<number>(0);
  const [thirteenth1, setThirteenth1] = useState<number>(0);
  const [thirteenth2, setThirteenth2] = useState<number>(0);
  
  const [baseSalary, setBaseSalary] = useState<number>(0);
  const [baseSecondarySalary, setBaseSecondarySalary] = useState<number>(0);
  const [baseThirteenth1, setBaseThirteenth1] = useState<number>(0);
  const [baseThirteenth2, setBaseThirteenth2] = useState<number>(0);
  
  const [monthlySalaries, setMonthlySalaries] = useState<Record<string, { salary: number, secondarySalary: number, thirteenth1?: number, thirteenth2?: number }>>({});
  
  const [tempSalary, setTempSalary] = useState<number>(0);
  const [tempSecondarySalary, setTempSecondarySalary] = useState<number>(0);
  const [tempThirteenth1, setTempThirteenth1] = useState<number>(0);
  const [tempThirteenth2, setTempThirteenth2] = useState<number>(0);
  
  const [isSalaryApplyModalOpen, setIsSalaryApplyModalOpen] = useState(false);
  const [isTributeModalOpen, setIsTributeModalOpen] = useState(false);
  const [editingTribute, setEditingTribute] = useState<Tribute | null>(null);
  
  const [theme, setTheme] = useState<'default' | 'dark'>('default');
  const [isThemeExpanded, setIsThemeExpanded] = useState(false);
  const [tributes, setTributes] = useState<Tribute[]>([
    { id: "t_dizimo", name: "Dízimo", percentage: 10, base: "total", enabled: false },
    { id: "t_passagem", name: "Passagem", percentage: 6, base: "main", enabled: false },
    { id: "t_inss", name: "INSS", percentage: 8, base: "main", enabled: false }
  ]);
  const [tributeFormData, setTributeFormData] = useState<Tribute>({
    id: '', name: '', percentage: 0, base: 'total', enabled: true
  });

  useEffect(() => {
    if (editingTribute) {
      setTributeFormData(editingTribute);
    } else {
      setTributeFormData({ id: '', name: '', percentage: 0, base: 'total', enabled: true });
    }
  }, [editingTribute, isTributeModalOpen]);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [additionalSalaries, setAdditionalSalaries] = useState<AdditionalSalary[]>([]);
  const [displayExpenses, setDisplayExpenses] = useState<Expense[]>([]);
  const [displayAdditionalSalaries, setDisplayAdditionalSalaries] = useState<AdditionalSalary[]>([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"home" | "report" | "debtors" | "settings">("home");
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(null);
  const [reportRange, setReportRange] = useState<{ start: string, end: string }>(() => {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return {
      start: `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`,
      end: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    };
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDebtorModalOpen, setIsDebtorModalOpen] = useState(false);
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [isAdditionalSalaryModalOpen, setIsAdditionalSalaryModalOpen] = useState(false);
  const [isAdditionalSalaryListModalOpen, setIsAdditionalSalaryListModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isRecurringActionModalOpen, setIsRecurringActionModalOpen] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [isDeleteAdditionalSalaryConfirmModalOpen, setIsDeleteAdditionalSalaryConfirmModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [selectedDebtorForBilling, setSelectedDebtorForBilling] = useState<Debtor | null>(null);
  const [billingMessage, setBillingMessage] = useState("");
  const [billingCopied, setBillingCopied] = useState(false);
  const [pixKey, setPixKey] = useState(() => localStorage.getItem('user-pix-key') || "");
  const [pixBank, setPixBank] = useState(() => localStorage.getItem('user-pix-bank') || "");
  const [pixResponsible, setPixResponsible] = useState(() => localStorage.getItem('user-pix-responsible') || "");
  const [isEditingPix, setIsEditingPix] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [debtorToDelete, setDebtorToDelete] = useState<string | null>(null);
  const [additionalSalaryToDelete, setAdditionalSalaryToDelete] = useState<string | null>(null);
  const [recurringActionType, setRecurringActionType] = useState<"edit" | "delete" | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [editingAdditionalSalary, setEditingAdditionalSalary] = useState<AdditionalSalary | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [isFixedExpensesExpanded, setIsFixedExpensesExpanded] = useState(false);
  const [isVariableExpensesExpanded, setIsVariableExpensesExpanded] = useState(false);
  const [isEfficiencyExpanded, setIsEfficiencyExpanded] = useState(false);

  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const APP_VERSION = "1.0.5"; // Increment this to track updates

  const [feedbackRating, setFeedbackRating] = useState<number>(0);
  const [feedbackMessage, setFeedbackMessage] = useState<string>("");
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [userFeedback, setUserFeedback] = useState<any | null>(null);
  const [adminTab, setAdminTab] = useState<'users' | 'feedbacks' | 'updates'>('users');
  const [updateForm, setUpdateForm] = useState<AppUpdateInfo>({
    title: '',
    version: '',
    changelog: '',
    isMandatory: false,
    updatedAt: '',
  });
  const [isSavingUpdate, setIsSavingUpdate] = useState(false);

  // Sync update form with fetched info
  useEffect(() => {
    if (appUpdateInfo) {
      setUpdateForm(appUpdateInfo);
    }
  }, [appUpdateInfo]);

  const handleSaveAppUpdate = async () => {
    if (!updateForm.title || !updateForm.version) {
      alert("Título e versão são obrigatórios.");
      return;
    }
    
    setIsSavingUpdate(true);
    try {
      await setDoc(doc(db, "systemSettings/appUpdate"), {
        ...updateForm,
        updatedAt: new Date().toISOString()
      });
      alert("Atualização configurada. Lembre-se de fazer o deploy no Vercel.");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "systemSettings/appUpdate");
    } finally {
      setIsSavingUpdate(false);
    }
  };

  const [systemConfig, setSystemConfig] = useState<{ appIconUrl?: string }>({});
  // Fetch System Config
  useEffect(() => {
    const configPath = "system/config";
    const unsubscribe = onSnapshot(doc(db, configPath), (docSnap) => {
      if (docSnap.exists()) {
        setSystemConfig(docSnap.data() as { appIconUrl?: string });
      }
    });
    return () => unsubscribe();
  }, []);

  // Update PWA icons dynamically and cache for Service Worker
  useEffect(() => {
    // Priority: Admin custom icon (App Identity) > User profile picture > Default icon
    const iconUrl = systemConfig.appIconUrl || userPhotoUrl || "/icon-192.png";
    
    const updateLink = (rel: string, href: string) => {
      let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = href;
    };

    const updateMeta = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`) || document.querySelector(`meta[name="${property}"]`);
      if (meta) {
        meta.setAttribute('content', content);
      }
    };

    updateLink('icon', iconUrl);
    updateLink('apple-touch-icon', iconUrl);
    
    // Attempt to update social tags (scrapers may ignore, but good for client-side visibility)
    updateMeta('og:image', iconUrl);
    updateMeta('twitter:image', iconUrl);

    // Save icon to cache for Service Worker to use in the manifest
    if (iconUrl && iconUrl !== "/icon-192.png" && 'caches' in window) {
      const updateIconCache = async () => {
        try {
          const cache = await caches.open('dynamic-icons');
          const response = await fetch(iconUrl);
          if (response.ok) {
            await cache.put('user-profile-pic', response);
          }
        } catch (error) {
          console.error("Error updating icon cache:", error);
        }
      };
      updateIconCache();
    }
  }, [userPhotoUrl, systemConfig.appIconUrl]);

  const handleProfilePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Firestore document limit is 1MB. We'll limit to 800KB to be safe with other fields.
    if (file.size > 800000) {
      alert("A imagem é muito grande. Por favor, escolha uma imagem menor que 800KB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        // Update Firestore settings (primary storage for photo)
        const settingsPath = `users/${user.uid}/settings/main`;
        await setDoc(doc(db, settingsPath), { photoURL: base64String }, { merge: true });
        
        // Update state immediately for better UX
        setUserPhotoUrl(base64String);

        // Try to update Firebase Auth profile (might fail if too large, but we have Firestore)
        try {
          await updateProfile(user, { photoURL: base64String });
        } catch (authError) {
          console.warn("Auth profile update failed (likely size limit), using Firestore instead.");
        }

        // If admin, also update system icon for new users/unlogged users
        if (isAdmin) {
          await setDoc(doc(db, "system/config"), { appIconUrl: base64String }, { merge: true });
        }
      } catch (error) {
        console.error("Error updating profile photo:", error);
      }
    };
    reader.readAsDataURL(file);
  };

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // PWA Install Prompt Listener
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  // Firestore Real-time Listeners
  useEffect(() => {
    if (!user) {
      setExpenses([]);
      setAdditionalSalaries([]);
      setSalary(0);
      setSecondarySalary(0);
      setTributes([
        { id: "t_dizimo", name: "Dízimo", percentage: 10, base: "total", enabled: false },
        { id: "t_passagem", name: "Passagem", percentage: 6, base: "main", enabled: false },
        { id: "t_inss", name: "INSS", percentage: 8, base: "main", enabled: false }
      ]);
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

    // App User Status Sync
    const userStatusPath = `app_users/${user.uid}`;
    const userStatusUnsubscribe = onSnapshot(doc(db, userStatusPath), async (docSnap) => {
      if (docSnap.exists()) {
        setAppUserStatus(docSnap.data().status as AppUser['status']);
      } else {
        // Create pending user if not exists (or active if admin)
        const initialStatus = isAdmin ? 'active' : 'pending';
        try {
          await setDoc(doc(db, userStatusPath), {
            id: user.uid,
            name: user.displayName || 'Unknown User',
            email: user.email || 'No Email',
            status: initialStatus,
            createdAt: new Date().toISOString()
          });
          setAppUserStatus(initialStatus);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, userStatusPath);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, userStatusPath);
    });

    // Admin Users List Sync
    let allUsersUnsubscribe = () => {};
    if (isAdmin) {
      allUsersUnsubscribe = onSnapshot(collection(db, 'app_users'), (querySnapshot) => {
        const users: AppUser[] = [];
        querySnapshot.forEach((doc) => {
          users.push(doc.data() as AppUser);
        });
        setAllAppUsers(users);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'app_users');
      });
    }

    // Listen to Settings (Salary & Dashboard Order)
    const settingsPath = `users/${user.uid}/settings/main`;
    const settingsUnsubscribe = onSnapshot(doc(db, settingsPath), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const cloudSalary = data.salary || 0;
        const cloudSecondarySalary = data.secondarySalary || 0;
        const cloudThirteenth1 = data.thirteenth1 || 0;
        const cloudThirteenth2 = data.thirteenth2 || 0;
        const cloudMonthlySalaries = data.monthlySalaries || {};
        
        if (data.theme) {
          setTheme(data.theme);
        }
        
        let cloudTributes = data.tributes;
        if (!cloudTributes) {
          // Migration from old tithe fields
          cloudTributes = [
            { id: "t_dizimo", name: "Dízimo", percentage: 10, base: "total", enabled: data.isTitheEnabled || false },
            { id: "t_passagem", name: "Passagem", percentage: 6, base: "main", enabled: false },
            { id: "t_inss", name: "INSS", percentage: 8, base: "main", enabled: false }
          ];
        }
        
        if (data.photoURL) {
          setUserPhotoUrl(data.photoURL);
        } else if (user.photoURL) {
          setUserPhotoUrl(user.photoURL);
        }

        setTributes(cloudTributes);
        setMonthlySalaries(cloudMonthlySalaries);
        setBaseSalary(cloudSalary);
        setBaseSecondarySalary(cloudSecondarySalary);
        setBaseThirteenth1(cloudThirteenth1);
        setBaseThirteenth2(cloudThirteenth2);

        const currentMonthStr = currentDate.toISOString().slice(0, 7);
        const currentMonthlyData = cloudMonthlySalaries[currentMonthStr];

        setSalary(prev => {
          const target = currentMonthlyData ? currentMonthlyData.salary : cloudSalary;
          if (prev !== target && !isSavingSalary) return target;
          return prev;
        });

        setSecondarySalary(prev => {
          const target = currentMonthlyData ? currentMonthlyData.secondarySalary : cloudSecondarySalary;
          if (prev !== target && !isSavingSalary) return target;
          return prev;
        });
        
        setThirteenth1(prev => {
          const target = currentMonthlyData && currentMonthlyData.thirteenth1 !== undefined ? currentMonthlyData.thirteenth1 : cloudThirteenth1;
          if (prev !== target && !isSavingSalary) return target;
          return prev;
        });
        
        setThirteenth2(prev => {
          const target = currentMonthlyData && currentMonthlyData.thirteenth2 !== undefined ? currentMonthlyData.thirteenth2 : cloudThirteenth2;
          if (prev !== target && !isSavingSalary) return target;
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

    // Listen to Debtors
    const debtorsPath = `users/${user.uid}/debtors`;
    const debtorsQuery = query(collection(db, debtorsPath));
    const debtorsUnsubscribe = onSnapshot(debtorsQuery, (snapshot) => {
      const items: Debtor[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as Debtor);
      });
      setDebtors(items);
      setIsSyncing(snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache);
    }, (error) => handleFirestoreError(error, OperationType.GET, debtorsPath));

    // Listen to User Feedback
    const userFeedbackPath = `feedbacks/${user.uid}`;
    const userFeedbackUnsubscribe = onSnapshot(doc(db, userFeedbackPath), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserFeedback(data);
        setFeedbackRating(data.stars);
        setFeedbackMessage(data.message);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, userFeedbackPath));

    // Listen to all Feedbacks (Admin)
    let allFeedbacksUnsubscribe = () => {};
    if (isAdmin) {
      allFeedbacksUnsubscribe = onSnapshot(collection(db, 'feedbacks'), (snapshot) => {
        const items: any[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() });
        });
        setFeedbacks(items);
      }, (error) => handleFirestoreError(error, OperationType.GET, 'feedbacks'));
    }

    return () => {
      userStatusUnsubscribe();
      allUsersUnsubscribe();
      settingsUnsubscribe();
      expensesUnsubscribe();
      additionalUnsubscribe();
      debtorsUnsubscribe();
      userFeedbackUnsubscribe();
      allFeedbacksUnsubscribe();
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

  // Update salary state when currentDate changes
  useEffect(() => {
    if (!user || isSavingSalary) return;
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    const mOverride = monthlySalaries[currentMonthStr];
    
    if (mOverride) {
      setSalary(mOverride.salary);
      setSecondarySalary(mOverride.secondarySalary);
      setThirteenth1(mOverride.thirteenth1 !== undefined ? mOverride.thirteenth1 : baseThirteenth1);
      setThirteenth2(mOverride.thirteenth2 !== undefined ? mOverride.thirteenth2 : baseThirteenth2);
    } else {
      setSalary(baseSalary);
      setSecondarySalary(baseSecondarySalary);
      setThirteenth1(baseThirteenth1);
      setThirteenth2(baseThirteenth2);
    }
  }, [currentDate, monthlySalaries, baseSalary, baseSecondarySalary, baseThirteenth1, baseThirteenth2, user]);

  const updateSalaryOrder = async (newOrder: AdditionalSalary[]) => {
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

  const confirmSalarySave = async (option: 'all' | 'current' | 'future') => {
    if (!user) return;
    setIsSavingSalary(true);
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    const settingsPath = `users/${user.uid}/settings/main`;
    
    try {
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };

      if (option === 'all') {
        updateData.salary = tempSalary;
        updateData.secondarySalary = tempSecondarySalary;
        updateData.thirteenth1 = tempThirteenth1;
        updateData.thirteenth2 = tempThirteenth2;
        updateData.monthlySalaries = {}; 
      } else if (option === 'current') {
        const newMonthly = { ...monthlySalaries };
        newMonthly[currentMonthStr] = { salary: tempSalary, secondarySalary: tempSecondarySalary, thirteenth1: tempThirteenth1, thirteenth2: tempThirteenth2 };
        updateData.monthlySalaries = newMonthly;
      } else if (option === 'future') {
        const newMonthly = { ...monthlySalaries };
        const monthsWithActivity = Array.from(new Set([
          ...expenses.map(e => e.date.slice(0, 7)),
          ...debtors.map(d => d.date.slice(0, 7)),
          ...additionalSalaries.map(s => s.date.slice(0, 7))
        ])).filter(mStr => mStr < currentMonthStr);

        monthsWithActivity.forEach(mStr => {
          if (!newMonthly[mStr]) {
            newMonthly[mStr] = { salary: baseSalary, secondarySalary: baseSecondarySalary, thirteenth1: baseThirteenth1, thirteenth2: baseThirteenth2 };
          }
        });

        newMonthly[currentMonthStr] = { salary: tempSalary, secondarySalary: tempSecondarySalary, thirteenth1: tempThirteenth1, thirteenth2: tempThirteenth2 };
        Object.keys(newMonthly).forEach(mStr => {
          if (mStr > currentMonthStr) {
            newMonthly[mStr] = { salary: tempSalary, secondarySalary: tempSecondarySalary, thirteenth1: tempThirteenth1, thirteenth2: tempThirteenth2 };
          }
        });

        updateData.salary = tempSalary;
        updateData.secondarySalary = tempSecondarySalary;
        updateData.thirteenth1 = tempThirteenth1;
        updateData.thirteenth2 = tempThirteenth2;
        updateData.monthlySalaries = newMonthly;
      }

      await setDoc(doc(db, settingsPath), updateData, { merge: true });
      setIsSalaryApplyModalOpen(false);
      setIsSalaryModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, settingsPath);
    } finally {
      setIsSavingSalary(false);
    }
  };

  const handleToggleTribute = async (id: string, enabled: boolean) => {
    if (!user) return;
    const path = `users/${user.uid}/settings/main`;
    try {
      const newTributes = tributes.map(t => 
        t.id === id ? { ...t, enabled } : t
      );
      await setDoc(doc(db, path), { tributes: newTributes }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleUpdateTribute = async (updatedTribute: Tribute) => {
    if (!user) return;
    const path = `users/${user.uid}/settings/main`;
    try {
      const newTributes = tributes.map(t => 
        t.id === updatedTribute.id ? updatedTribute : t
      );
      await setDoc(doc(db, path), { tributes: newTributes }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleAddTribute = async (newTribute: Tribute) => {
    if (!user) return;
    const path = `users/${user.uid}/settings/main`;
    try {
      const newTributes = [...tributes, newTribute];
      await setDoc(doc(db, path), { tributes: newTributes }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleUpdateAppUserStatus = async (targetUserId: string, newStatus: AppUser['status']) => {
    if (!isAdmin && newStatus !== 'pending') return; // Only admin can explicitly set status (except user resetting to pending)
    const targetPath = `app_users/${targetUserId}`;
    try {
      await updateDoc(doc(db, targetPath), { status: newStatus });
      if (targetUserId === user?.uid) {
        setAppUserStatus(newStatus);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, targetPath);
    }
  };

  const handleSaveTribute = async () => {
    if (!tributeFormData.name) {
      setValidationError("O nome do tributo é obrigatório.");
      return;
    }
    setValidationError(null);
    if (editingTribute) {
      await handleUpdateTribute(tributeFormData);
    } else {
      await handleAddTribute({
        ...tributeFormData,
        id: "t_" + Math.random().toString(36).substr(2, 9)
      });
    }
    setIsTributeModalOpen(false);
  };

  const handleDeleteTribute = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/settings/main`;
    try {
      const newTributes = tributes.filter(t => t.id !== id);
      await setDoc(doc(db, path), { tributes: newTributes }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const APP_URL = "https://orin-lcl.vercel.app";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(APP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyBillingToClipboard = () => {
    if (!billingMessage) return;
    navigator.clipboard.writeText(billingMessage);
    setBillingCopied(true);
    setTimeout(() => setBillingCopied(false), 2000);
  };

  const savePixData = (key: string, bank: string, resp: string) => {
    setPixKey(key);
    setPixBank(bank);
    setPixResponsible(resp);
    localStorage.setItem('user-pix-key', key);
    localStorage.setItem('user-pix-bank', bank);
    localStorage.setItem('user-pix-responsible', resp);
  };

  const copyPixToClipboard = () => {
    if (!pixKey) return;
    navigator.clipboard.writeText(pixKey);
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 2000);
  };

  const generateBillingMessage = (debtor: Debtor) => {
    const formattedValue = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(debtor.value);
    
    // Extraímos o primeiro nome do devedor para a saudação
    const firstName = debtor.description.split(' ')[0];
    
    let message = `Olá ${firstName}, seguem os dados para o pagamento.

Total a pagar: ${formattedValue}

Detalhamento:
• ${debtor.description}:
${formattedValue} ${debtor.notes ? `(${debtor.notes})` : `(${debtor.description})`}`;

    if (pixKey) {
      message += `\nChave PIX: ${pixKey}`;
      if (pixBank) message += `\nBanco: ${pixBank}`;
      if (pixResponsible) message += `\nResponsável: ${pixResponsible}`;
    }

    message += `\n\nObrigado!`;
    
    setBillingMessage(message);
    setSelectedDebtorForBilling(debtor);
  };

  const shareBillingMessage = async () => {
    if (!billingMessage) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          text: billingMessage,
        });
      } catch (err) {
        console.error("Error sharing:", err);
        // Fallback to WhatsApp if share fails
        window.open(`https://wa.me/?text=${encodeURIComponent(billingMessage)}`, '_blank');
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(billingMessage)}`, '_blank');
    }
  };

  const handleAddExpense = async () => {
    if (!user || isSaving) return;
    
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
    
    if (editingExpense && (editingExpense.isFixed || editingExpense.parentId || editingExpense.isRecurring)) {
      setBulkActionTarget({ type: 'edit', expense: editingExpense });
      setIsBulkConfirmOpen(true);
      return;
    }

    setIsSaving(true);
    const basePath = `users/${user.uid}/expenses`;
    const maxOrder = Math.max(...filteredExpenses.map(e => e.order || 0), -1);
    const nextOrder = maxOrder + 1;

    try {
      if (editingExpense) {
        // Save for undo
        triggerUndo({
          type: 'edit',
          entity: 'expense',
          data: { ...editingExpense },
          timestamp: Date.now()
        });

        const path = `${basePath}/${editingExpense.id}`;
        
        // If it's a bulk edit, the bulkActionTarget logic will handle it differently, 
        // but for single edit we still use the value as is.
        await setDoc(doc(db, path), sanitizeData({
          ...formData,
          uid: user.uid,
          order: editingExpense.order ?? nextOrder
        }));

        // Month sync
        const newDate = new Date(formData.date + "T12:00:00");
        if (newDate.getMonth() !== currentDate.getMonth() || newDate.getFullYear() !== currentDate.getFullYear()) {
          setCurrentDate(newDate);
        }
      } else {
        if (formData.isRecurring && formData.repeatCount > 1) {
          const parentId = generateId();
          const [y, m, d] = formData.date.split('-').map(Number);
          const baseDate = new Date(y, m - 1, d);
          
          let baseDueDate: Date | null = null;
          if (formData.dueDate) {
            const [dy, dm, dd] = formData.dueDate.split('-').map(Number);
            baseDueDate = new Date(dy, dm - 1, dd);
          }

          const batch = writeBatch(db);
          const newItems = [];
          
          // Calculate unit value based on calculationType
          const unitValue = formData.calculationType === 'total' 
            ? formData.value / formData.repeatCount 
            : formData.value;

          for (let i = 0; i < formData.repeatCount; i++) {
            let nextDate: Date;
            let nextDueDateStr = "";

            if (formData.repeatFrequency === "monthly") {
              nextDate = addMonths(baseDate, i);
              if (baseDueDate) {
                nextDueDateStr = formatDateToISO(addMonths(baseDueDate, i));
              }
            } else {
              nextDate = addYears(baseDate, i);
              if (baseDueDate) {
                nextDueDateStr = formatDateToISO(addYears(baseDueDate, i));
              }
            }

            const id = generateId();
            const path = `${basePath}/${id}`;
            const itemData = {
              ...formData,
              value: unitValue, // Use correctly calculated unit value
              uid: user.uid,
              date: formatDateToISO(nextDate),
              dueDate: nextDueDateStr || formData.dueDate,
              parentId: parentId,
              installmentIndex: i + 1,
              order: nextOrder,
            };
            batch.set(doc(db, path), sanitizeData(itemData));
            newItems.push({ id, ...itemData });
          }
          await batch.commit();
        } else {
          const id = generateId();
          const path = `${basePath}/${id}`;
          await setDoc(doc(db, path), sanitizeData({
            ...formData,
            uid: user.uid,
            order: nextOrder
          }));
        }
      }
      setIsAddModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, basePath);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteExpense = (id: string) => {
    const expense = expenses.find(e => e.id === id);
    if (!expense || !user) return;

    if (expense.isFixed || expense.parentId || expense.isRecurring) {
      setBulkActionTarget({ type: 'delete', expense });
      setIsBulkConfirmOpen(true);
    } else {
      setExpenseToDelete(id);
      setIsDeleteConfirmModalOpen(true);
    }
  };

  const confirmDeleteExpense = async () => {
    if (expenseToDelete && user) {
      const expense = expenses.find(e => e.id === expenseToDelete);
      const path = `users/${user.uid}/expenses/${expenseToDelete}`;
      try {
        if (expense) {
          triggerUndo({
            type: 'delete',
            entity: 'expense',
            data: { ...expense },
            timestamp: Date.now()
          });
        }
        await deleteDoc(doc(db, path));
        setExpenseToDelete(null);
        setIsDeleteConfirmModalOpen(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  };

  const triggerUndo = (state: UndoState) => {
    setUndoState(state);
    setIsUndoVisible(true);
    setTimeout(() => {
      setIsUndoVisible(false);
      setUndoState(null);
    }, 5000);
  };

  const handleUndo = async () => {
    if (!undoState || !user) return;
    setIsUndoVisible(false);

    try {
      if (undoState.type === 'delete') {
        const batch = writeBatch(db);
        const records = Array.isArray(undoState.data) ? undoState.data : [undoState.data];
        records.forEach(item => {
          let path = '';
          if (undoState.entity === 'expense') path = `users/${user.uid}/expenses/${item.id}`;
          if (undoState.entity === 'debtor') path = `users/${user.uid}/debtors/${item.id}`;
          if (undoState.entity === 'additionalSalary') path = `users/${user.uid}/additionalSalaries/${item.id}`;
          
          if (path) batch.set(doc(db, path), sanitizeData(item));
        });
        await batch.commit();
      } else if (undoState.type === 'edit') {
        const batch = writeBatch(db);
        const records = Array.isArray(undoState.data) ? undoState.data : [undoState.data];
        records.forEach(item => {
          let path = '';
          if (undoState.entity === 'expense') path = `users/${user.uid}/expenses/${item.id}`;
          if (undoState.entity === 'debtor') path = `users/${user.uid}/debtors/${item.id}`;
          if (undoState.entity === 'additionalSalary') path = `users/${user.uid}/additionalSalaries/${item.id}`;
          
          if (path) batch.set(doc(db, path), sanitizeData(item));
        });
        await batch.commit();
      }
      setUndoState(null);
    } catch (error) {
      console.error("Undo failed:", error);
    }
  };

  const handleBulkAction = async (bulkType: BulkActionType) => {
    if (!bulkActionTarget || !user) return;
    const { type: actionType, expense, debtor } = bulkActionTarget;
    setIsSaving(true);
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    
    // Determine entity details
    const entity = expense || debtor;
    if (!entity) return;
    
    const isExpense = !!expense;
    const targetGroupId = entity.parentId || entity.id;
    const basePath = `users/${user.uid}/${isExpense ? 'expenses' : 'debtors'}`;
    const collection = isExpense ? expenses : debtors;

    try {
      const itemsToProcess = collection.filter(e => {
        // Correct check for fixed items: they might not have parentId but same description
        const isSameGroup = e.id === targetGroupId || e.parentId === targetGroupId || (entity.isFixed && e.description === entity.description);
        if (!isSameGroup) return false;

        const isEffective = entity.isFixed 
          ? (isExpense ? ((e as Expense).paidMonths || []) : ((e as Debtor).receivedMonths || [])).includes(currentMonthStr)
          : (isExpense ? (e as Expense).isPaid : (e as Debtor).isReceived);
        
        const eMonth = e.date.slice(0, 7);

        switch (bulkType) {
          case 'single': return e.id === entity.id;
          case 'pending': return !isEffective;
          case 'effective': return isEffective;
          case 'current_plus_pending': return e.id === entity.id || (eMonth >= currentMonthStr && !isEffective);
          case 'current_plus_effective': return e.id === entity.id || (eMonth <= currentMonthStr && isEffective);
          default: return false;
        }
      });

      // Save for Undo
      triggerUndo({
        type: actionType,
        entity: isExpense ? 'expense' : 'debtor',
        data: itemsToProcess.map(item => ({ ...item })),
        timestamp: Date.now()
      });

      const batch = writeBatch(db);
      for (const item of itemsToProcess) {
        const path = `${basePath}/${item.id}`;
        if (actionType === 'delete') {
          batch.delete(doc(db, path));
        } else {
          // Update data logic
          const updateSource = isExpense ? formData : debtorFormData;
          
          // For recurring items, we don't usually want to change the dates of ALL items to the SAME date
          // unless it's just the 'single' update of the current one.
          const finalDate = (item.id === entity.id) ? updateSource.date : item.date;

          batch.set(doc(db, path), sanitizeData({
            ...item,
            ...updateSource,
            uid: user.uid,
            date: finalDate,
            parentId: item.parentId || null
          }));
        }
      }
      await batch.commit();

      // Update currentDate if month changed to show the item in its new "competência"
      const updateSource = isExpense ? formData : debtorFormData;
      const newUpdateDate = new Date(updateSource.date + "T12:00:00");
      if (newUpdateDate.getMonth() !== currentDate.getMonth() || newUpdateDate.getFullYear() !== currentDate.getFullYear()) {
         setCurrentDate(newUpdateDate);
      }

      setIsBulkConfirmOpen(false);
      setBulkActionTarget(null);
      if (isExpense) {
        setIsAddModalOpen(false);
        resetForm();
      } else {
        setIsDebtorModalOpen(false);
        resetDebtorForm();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, basePath);
    } finally {
      setIsSaving(false);
    }
  };
  const getInstallmentMessage = (data: { value: number, date: string, repeatCount: number, calculationType: "total" | "monthly" }) => {
    if (!data.repeatCount || data.repeatCount <= 1) return null;
    
    const [y, m, d] = data.date.split('-').map(Number);
    const endDate = new Date(y, m - 1 + (data.repeatCount - 1), d);
    const monthName = endDate.toLocaleString('pt-BR', { month: 'long' });
    
    const monthlyValue = data.calculationType === "total" 
      ? data.value / data.repeatCount 
      : data.value;
      
    return `Essa parcela termina em ${monthName} com valor de ${formatCurrency(monthlyValue)} por mês.`;
  };

  const handleTogglePaid = async (expense: Expense) => {
    if (!user) return;
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    const path = `users/${user.uid}/expenses/${expense.id}`;
    
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
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleMarkAllFixedPaid = async () => {
    if (!user || fixedExpenses.length === 0) return;
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    const batch = writeBatch(db);
    let count = 0;
    
    fixedExpenses.forEach(expense => {
      const paidMonths = expense.paidMonths || [];
      if (!paidMonths.includes(currentMonthStr)) {
        const expenseRef = doc(db, `users/${user.uid}/expenses/${expense.id}`);
        batch.update(expenseRef, { paidMonths: [...paidMonths, currentMonthStr] });
        count++;
      }
    });
    
    if (count > 0) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, "batch-fixed-paid");
      }
    }
  };

  const handleMarkAllVariablePaid = async () => {
    if (!user || variableExpenses.length === 0) return;
    const batch = writeBatch(db);
    let count = 0;
    
    variableExpenses.forEach(expense => {
      if (!expense.isPaid) {
        const expenseRef = doc(db, `users/${user.uid}/expenses/${expense.id}`);
        batch.update(expenseRef, { isPaid: true });
        count++;
      }
    });
    
    if (count > 0) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, "batch-variable-paid");
      }
    }
  };

  const handleMarkWeekPaid = async (expensesInWeek: Expense[]) => {
    if (!user || expensesInWeek.length === 0) return;
    const batch = writeBatch(db);
    let count = 0;
    
    expensesInWeek.forEach(expense => {
      if (!expense.isPaid) {
        const expenseRef = doc(db, `users/${user.uid}/expenses/${expense.id}`);
        batch.update(expenseRef, { isPaid: true });
        count++;
      }
    });
    
    if (count > 0) {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, "batch-week-paid");
      }
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
      const salary = additionalSalaries.find(s => s.id === additionalSalaryToDelete);
      const path = `users/${user.uid}/additionalSalaries/${additionalSalaryToDelete}`;
      try {
        if (salary) {
          triggerUndo({
            type: 'delete',
            entity: 'additionalSalary',
            data: { ...salary },
            timestamp: Date.now()
          });
        }
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
    dueDate: string;
    calculationType: "total" | "monthly";
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
      dueDate: "",
      calculationType: "monthly",
    };
  });

  const [debtorFormData, setDebtorFormData] = useState<{
    value: number;
    description: string;
    isFixed: boolean;
    isRecurring: boolean;
    repeatCount: number;
    repeatFrequency: "monthly" | "yearly";
    notes: string;
    date: string;
    category: string;
    calculationType: "total" | "monthly";
  }>(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return {
      value: 0,
      description: "",
      isFixed: false,
      isRecurring: false,
      repeatCount: 1,
      repeatFrequency: "monthly",
      notes: "",
      date: today,
      category: DEFAULT_CATEGORIES[0],
      calculationType: "monthly",
    };
  });

  const adjustDateToMonth = (dateStr: string, targetMonthStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [targetY, targetM] = targetMonthStr.split('-').map(Number);
    
    // Create a date object for the target month and year, but with the original day
    const date = new Date(targetY, targetM - 1, d);
    
    // If the day overflowed (e.g., April 31st becomes May 1st), 
    // set it to the last day of the target month
    if (date.getMonth() !== targetM - 1) {
      return new Date(targetY, targetM, 0).toISOString().slice(0, 10);
    }
    
    return date.toISOString().slice(0, 10);
  };

  const { fixedExpenses, variableExpenses } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const currentMonthStr = `${year}-${month}`;
    const fixed: Expense[] = [];
    const variable: Expense[] = [];

    expenses.forEach(expense => {
      const expenseMonthStr = expense.date.slice(0, 7);

      if (expense.isFixed) {
        if (expenseMonthStr <= currentMonthStr) {
          const adjustedDate = adjustDateToMonth(expense.date, currentMonthStr);
          const adjustedDueDate = expense.dueDate ? adjustDateToMonth(expense.dueDate, currentMonthStr) : undefined;
          
          fixed.push({
            ...expense,
            date: adjustedDate,
            dueDate: adjustedDueDate,
            isPaid: expense.paidMonths?.includes(currentMonthStr) || false
          });
        }
      } else {
        if (expenseMonthStr === currentMonthStr) {
          variable.push(expense);
        }
      }
    });

    // Sort fixed alphabetically
    fixed.sort((a, b) => a.description.localeCompare(b.description));

    // Sort variable by date
    variable.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { fixedExpenses: fixed, variableExpenses: variable };
  }, [expenses, currentDate]);

  const filteredExpenses = useMemo(() => [...fixedExpenses, ...variableExpenses], [fixedExpenses, variableExpenses]);

  const { fixedDebtors, variableDebtors } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const currentMonthStr = `${year}-${month}`;
    const fixed: Debtor[] = [];
    const variable: Debtor[] = [];

    debtors.forEach(debtor => {
      const debtorMonthStr = debtor.date.slice(0, 7);

      if (debtor.isFixed) {
        if (debtorMonthStr <= currentMonthStr) {
          fixed.push({
            ...debtor,
            date: `${currentMonthStr}-${debtor.date.slice(8, 10)}`,
            isReceived: debtor.receivedMonths?.includes(currentMonthStr) || false
          });
        }
      } else {
        if (debtorMonthStr === currentMonthStr) {
          variable.push(debtor);
        }
      }
    });

    fixed.sort((a, b) => a.description.localeCompare(b.description));
    variable.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { fixedDebtors: fixed, variableDebtors: variable };
  }, [debtors, currentDate]);

  const filteredDebtors = useMemo(() => [...fixedDebtors, ...variableDebtors], [fixedDebtors, variableDebtors]);

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

  const totalAdditionalSalary = useMemo(() => {
    return filteredAdditionalSalaries.reduce((acc, curr) => acc + curr.value, 0);
  }, [filteredAdditionalSalaries]);

  const { grossIncome, totalIncome, totalTributesDiscount } = useMemo(() => {
    const grossTotal = salary + secondarySalary + thirteenth1 + thirteenth2 + totalAdditionalSalary;
    
    let totalDiscount = 0;
    
    tributes.forEach(t => {
      if (t.enabled) {
        if (t.base === 'main') {
          totalDiscount += (salary + thirteenth1 + thirteenth2 + secondarySalary) * (t.percentage / 100);
        } else {
          totalDiscount += grossTotal * (t.percentage / 100);
        }
      }
    });

    return {
      grossIncome: grossTotal,
      totalIncome: grossTotal - totalDiscount,
      totalTributesDiscount: totalDiscount
    };
  }, [salary, secondarySalary, thirteenth1, thirteenth2, totalAdditionalSalary, tributes]);

  const { totalMonthlyExpenses, totalPaidExpenses, totalRemainingExpenses } = useMemo(() => {
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    
    // Calculate unpaid debtors to include in "A Pagar" as requested
    const unpaidDebtorsValue = debtors.filter(d => {
      // For fixed debtors, check if current month is not in receivedMonths
      if (d.isFixed) {
        return !(d.receivedMonths || []).includes(currentMonthStr);
      }
      // For variable debtors, check isReceived and date
      return !d.isReceived && d.date.slice(0, 7) === currentMonthStr;
    }).reduce((acc, curr) => acc + curr.value, 0);

    const total = filteredExpenses.reduce((acc, curr) => acc + curr.value, 0) + unpaidDebtorsValue;
    const paid = filteredExpenses.filter(e => e.isPaid).reduce((acc, curr) => acc + curr.value, 0);
    const remaining = total - paid;
    return { 
      totalMonthlyExpenses: total, 
      totalPaidExpenses: paid, 
      totalRemainingExpenses: remaining
    };
  }, [filteredExpenses, currentDate, debtors]);

  const balance = totalIncome - totalMonthlyExpenses;

  const handleThemeChange = async (newTheme: 'default' | 'dark') => {
    setTheme(newTheme);
    if (!user) return;
    const settingsPath = `users/${user.uid}/settings/main`;
    try {
      await setDoc(doc(db, settingsPath), { theme: newTheme }, { merge: true });
    } catch (error) {
      console.error("Error saving theme:", error);
    }
  };

  // Logic for dynamic balance messages
  const balanceMessage = useMemo(() => {
    // 1. Calculate previous month's balance for comparison
    const prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
    const prevMonthStr = `${prevYear}-${prevMonth}`;

    let prevTotalExpenses = 0;
    expenses.forEach(expense => {
      const expenseMonthStr = expense.date.slice(0, 7);
      if (expense.isFixed) {
        if (expenseMonthStr <= prevMonthStr) {
          prevTotalExpenses += expense.value;
        }
      } else {
        if (expenseMonthStr === prevMonthStr) {
          prevTotalExpenses += expense.value;
        }
      }
    });

    let prevAdditionalSalary = 0;
    additionalSalaries.forEach(s => {
      if (s.date.slice(0, 7) === prevMonthStr) {
        prevAdditionalSalary += s.value;
      }
    });

    const prevGrossTotalIncome = salary + secondarySalary + thirteenth1 + thirteenth2 + prevAdditionalSalary;
    
    let totalDiscount = 0;
    tributes.forEach(t => {
      if (t.enabled) {
        if (t.base === 'main') {
          totalDiscount += (salary + thirteenth1 + thirteenth2 + secondarySalary) * (t.percentage / 100);
        } else {
          totalDiscount += prevGrossTotalIncome * (t.percentage / 100);
        }
      }
    });

    const prevTotalIncome = prevGrossTotalIncome - totalDiscount;
    const prevBalance = prevTotalIncome - prevTotalExpenses;

    // 2. Apply rules in priority order
    
    // Rule: If equal, no message
    if (balance === prevBalance) {
      return null;
    }

    // Rule: If balance is negative (interpreted from "menor que rendimentos" in tough context)
    // This message takes priority when in debt/negative balance
    if (balance < 0) {
      return "Minha fé está além do impossível.";
    }

    // Rule: Comparison with previous month
    if (balance > prevBalance) {
      return "Parabéns, você economizou mais que no último mês.";
    } else if (balance < prevBalance) {
      return "Esse deserto vai passar.";
    }

    return null;
  }, [balance, totalIncome, expenses, additionalSalaries, currentDate, salary, secondarySalary]);

  const totalDebtors = useMemo(() => {
    return filteredDebtors.reduce((acc, curr) => acc + curr.value, 0);
  }, [filteredDebtors]);

  const totalReceivedDebtors = useMemo(() => {
    return filteredDebtors.filter(d => d.isReceived).reduce((acc, curr) => acc + curr.value, 0);
  }, [filteredDebtors]);

  const pendingDebtorsCount = useMemo(() => {
    return filteredDebtors.filter(d => !d.isReceived).length;
  }, [filteredDebtors]);

  const receivedDebtorsCount = useMemo(() => {
    return filteredDebtors.filter(d => d.isReceived).length;
  }, [filteredDebtors]);

  const debtorsReceivedPercentage = useMemo(() => {
    const total = filteredDebtors.length;
    if (total === 0) return 0;
    return (receivedDebtorsCount / total) * 100;
  }, [filteredDebtors, receivedDebtorsCount]);

  const resetDebtorForm = () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setDebtorFormData({
      value: 0,
      description: "",
      isFixed: false,
      isRecurring: false,
      repeatCount: 1,
      repeatFrequency: "monthly",
      notes: "",
      date: today,
      category: DEFAULT_CATEGORIES[0],
      calculationType: "monthly",
    });
    setEditingDebtor(null);
    setValidationError(null);
  };

  const handleAddDebtor = async () => {
    if (!user || isSaving) return;
    
    if (!debtorFormData.description.trim()) {
      setValidationError("O nome do devedor é obrigatório.");
      return;
    }
    if (debtorFormData.value <= 0) {
      setValidationError("O valor deve ser maior que zero.");
      return;
    }

    setValidationError(null);
    setIsSaving(true);
    
    const debtorData = {
      ...debtorFormData,
      uid: user.uid,
    };

    const basePath = `users/${user.uid}/debtors`;

    try {
      if (editingDebtor) {
        if (editingDebtor.isRecurring || editingDebtor.isFixed || editingDebtor.parentId) {
          setBulkActionTarget({ type: 'edit', debtor: editingDebtor });
          setIsBulkConfirmOpen(true);
          setIsSaving(false);

          // Update currentDate if month changed to show the item in its new "competência"
          const newDate = new Date(debtorFormData.date + "T12:00:00");
          if (newDate.getMonth() !== currentDate.getMonth() || newDate.getFullYear() !== currentDate.getFullYear()) {
             setCurrentDate(newDate);
          }
          return;
        }

        // Save for undo
        triggerUndo({
          type: 'edit',
          entity: 'debtor',
          data: { ...editingDebtor },
          timestamp: Date.now()
        });

        const path = `${basePath}/${editingDebtor.id}`;
        await setDoc(doc(db, path), sanitizeData(debtorData));
        
        // Month sync
        const newDate = new Date(debtorFormData.date + "T12:00:00");
        if (newDate.getMonth() !== currentDate.getMonth() || newDate.getFullYear() !== currentDate.getFullYear()) {
           setCurrentDate(newDate);
        }
      } else {
        if (debtorFormData.isRecurring && debtorFormData.repeatCount > 1) {
          const parentId = generateId();
          const [y, m, d] = debtorFormData.date.split('-').map(Number);
          const baseDate = new Date(y, m - 1, d);

          // Calculate unit value based on calculationType
          const unitValue = debtorFormData.calculationType === 'total' 
            ? debtorFormData.value / debtorFormData.repeatCount 
            : debtorFormData.value;

          const batch = writeBatch(db);
          for (let i = 0; i < debtorFormData.repeatCount; i++) {
            let nextDate: Date;
            if (debtorFormData.repeatFrequency === "monthly") {
              nextDate = addMonths(baseDate, i);
            } else {
              nextDate = addYears(baseDate, i);
            }

            const id = generateId();
            const path = `${basePath}/${id}`;
            batch.set(doc(db, path), sanitizeData({
              ...debtorData,
              value: unitValue, // Use unit value
              date: formatDateToISO(nextDate),
              parentId: parentId,
              installmentIndex: i + 1,
            }));
          }
          await batch.commit();
        } else {
          const id = generateId();
          const path = `${basePath}/${id}`;
          await setDoc(doc(db, path), sanitizeData(debtorData));
        }
      }
      setIsDebtorModalOpen(false);
      resetDebtorForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, basePath);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditDebtor = (debtor: Debtor) => {
    setEditingDebtor(debtor);
    setDebtorFormData({
      value: debtor.value,
      description: debtor.description,
      isFixed: !!debtor.isFixed,
      isRecurring: !!debtor.isRecurring,
      repeatCount: debtor.repeatCount || 1,
      repeatFrequency: debtor.repeatFrequency || "monthly",
      notes: debtor.notes || "",
      date: toISODate(debtor.date),
      category: debtor.category || (categories[0] || DEFAULT_CATEGORIES[0]),
      calculationType: "monthly",
    });
    setIsDebtorModalOpen(true);
  };

  const handleDeleteDebtor = (id: string) => {
    const debtor = debtors.find(d => d.id === id);
    if (debtor && (debtor.isRecurring || debtor.isFixed || debtor.parentId)) {
      setBulkActionTarget({ type: 'delete', debtor });
      setIsBulkConfirmOpen(true);
      return;
    }
    setDebtorToDelete(id);
    setIsDeleteConfirmModalOpen(true);
  };

  const confirmDeleteDebtor = async () => {
    if (debtorToDelete && user) {
      const debtor = debtors.find(d => d.id === debtorToDelete);
      const path = `users/${user.uid}/debtors/${debtorToDelete}`;
      try {
        if (debtor) {
          triggerUndo({
            type: 'delete',
            entity: 'debtor',
            data: { ...debtor },
            timestamp: Date.now()
          });
        }
        await deleteDoc(doc(db, path));
        setDebtorToDelete(null);
        setIsDeleteConfirmModalOpen(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  };

  const [debtorToConfirmExtra, setDebtorToConfirmExtra] = useState<Debtor | null>(null);
  const [isDebtorExtraConfirmModalOpen, setIsDebtorExtraConfirmModalOpen] = useState(false);
  const [viewingDebtorInfo, setViewingDebtorInfo] = useState<Debtor | null>(null);
  const [isDebtorInfoModalOpen, setIsDebtorInfoModalOpen] = useState(false);
  const [isSpeedDialOpen, setIsSpeedDialOpen] = useState(false);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [isUndoVisible, setIsUndoVisible] = useState(false);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [bulkActionTarget, setBulkActionTarget] = useState<{ type: 'edit' | 'delete', expense?: Expense, debtor?: Debtor } | null>(null);

  // Mobile Back Button Support
  useEffect(() => {
    const handlePopState = () => {
      let closedAny = false;
      if (isAddModalOpen) { setIsAddModalOpen(false); closedAny = true; }
      if (isDebtorModalOpen) { setIsDebtorModalOpen(false); closedAny = true; }
      if (isSalaryModalOpen) { setIsSalaryModalOpen(false); closedAny = true; }
      if (isAdditionalSalaryModalOpen) { setIsAdditionalSalaryModalOpen(false); closedAny = true; }
      if (isAdditionalSalaryListModalOpen) { setIsAdditionalSalaryListModalOpen(false); closedAny = true; }
      if (isSalaryApplyModalOpen) { setIsSalaryApplyModalOpen(false); closedAny = true; }
      if (isTributeModalOpen) { setIsTributeModalOpen(false); closedAny = true; }
      if (isAdminPanelOpen) { setIsAdminPanelOpen(false); closedAny = true; }
      if (isCategoryModalOpen) { setIsCategoryModalOpen(false); closedAny = true; }
      if (isBillingModalOpen) { setIsBillingModalOpen(false); closedAny = true; }
      if (isShareModalOpen) { setIsShareModalOpen(false); closedAny = true; }
      if (isDebtorInfoModalOpen) { setIsDebtorInfoModalOpen(false); closedAny = true; }
      if (isDebtorExtraConfirmModalOpen) { setIsDebtorExtraConfirmModalOpen(false); closedAny = true; }
      if (isBulkConfirmOpen) { setIsBulkConfirmOpen(false); closedAny = true; }
      if (showDiscardConfirm) { setShowDiscardConfirm(false); closedAny = true; }
      if (isRecurringActionModalOpen) { setIsRecurringActionModalOpen(false); closedAny = true; }
      if (isDeleteConfirmModalOpen) { setIsDeleteConfirmModalOpen(false); closedAny = true; }
      if (isDeleteAdditionalSalaryConfirmModalOpen) { setIsDeleteAdditionalSalaryConfirmModalOpen(false); closedAny = true; }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    isAddModalOpen, isDebtorModalOpen, isSalaryModalOpen, isAdditionalSalaryModalOpen,
    isAdditionalSalaryListModalOpen, isSalaryApplyModalOpen, isTributeModalOpen, 
    isAdminPanelOpen, isCategoryModalOpen, isBillingModalOpen, isShareModalOpen,
    isDebtorInfoModalOpen, isDebtorExtraConfirmModalOpen, isBulkConfirmOpen, 
    showDiscardConfirm, isRecurringActionModalOpen, isDeleteConfirmModalOpen, 
    isDeleteAdditionalSalaryConfirmModalOpen
  ]);

  useEffect(() => {
    const anyModalOpen = isAddModalOpen || isDebtorModalOpen || isSalaryModalOpen || 
                         isAdditionalSalaryModalOpen || isAdditionalSalaryListModalOpen ||
                         isSalaryApplyModalOpen || isTributeModalOpen || isAdminPanelOpen || 
                         isCategoryModalOpen || isBillingModalOpen || isShareModalOpen || 
                         isDebtorInfoModalOpen || isDebtorExtraConfirmModalOpen ||
                         isBulkConfirmOpen || showDiscardConfirm || isRecurringActionModalOpen ||
                         isDeleteConfirmModalOpen || isDeleteAdditionalSalaryConfirmModalOpen;
    
    if (anyModalOpen) {
      if (window.location.hash !== '#modal') {
        window.history.pushState(null, '', '#modal');
      }
    } else {
      if (window.location.hash === '#modal') {
        window.history.back();
      }
    }
  }, [
    isAddModalOpen, isDebtorModalOpen, isSalaryModalOpen, isAdditionalSalaryModalOpen,
    isAdditionalSalaryListModalOpen, isSalaryApplyModalOpen, isTributeModalOpen, 
    isAdminPanelOpen, isCategoryModalOpen, isBillingModalOpen, isShareModalOpen,
    isDebtorInfoModalOpen, isDebtorExtraConfirmModalOpen, isBulkConfirmOpen, 
    showDiscardConfirm, isRecurringActionModalOpen, isDeleteConfirmModalOpen, 
    isDeleteAdditionalSalaryConfirmModalOpen
  ]);

  const isExpenseFormDirty = () => {
    if (editingExpense) {
      return (
        formData.description !== editingExpense.description ||
        formData.value !== editingExpense.value ||
        formData.category !== editingExpense.category ||
        formData.notes !== (editingExpense.notes || "") ||
        formData.isFixed !== !!editingExpense.isFixed ||
        formData.isRecurring !== !!editingExpense.isRecurring
      );
    }
    return formData.description !== "" || formData.value !== 0 || formData.notes !== "";
  };

  const isDebtorFormDirty = () => {
    if (editingDebtor) {
      return (
        debtorFormData.description !== editingDebtor.description ||
        debtorFormData.value !== editingDebtor.value ||
        debtorFormData.notes !== (editingDebtor.notes || "") ||
        debtorFormData.category !== (editingDebtor.category || "")
      );
    }
    return debtorFormData.description !== "" || debtorFormData.value !== 0 || debtorFormData.notes !== "";
  };

  const isAdditionalSalaryFormDirty = () => {
    if (editingAdditionalSalary) {
      return (
        additionalSalaryFormData.description !== editingAdditionalSalary.description ||
        additionalSalaryFormData.value !== editingAdditionalSalary.value
      );
    }
    return additionalSalaryFormData.description !== "" || additionalSalaryFormData.value !== 0;
  };

  const handleCloseModal = (
    currentOpenState: boolean,
    setOpenState: (val: boolean) => void,
    isDirty: boolean,
    onConfirmClose: () => void
  ) => {
    if (isDirty) {
      setPendingCloseAction(() => onConfirmClose);
      setShowDiscardConfirm(true);
    } else {
      onConfirmClose();
    }
  };

  const handleToggleDebtorReceived = async (debtor: Debtor) => {
    if (!user) return;
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    const path = `users/${user.uid}/debtors/${debtor.id}`;
    
    try {
      const debtorRef = doc(db, path);
      let becomingReceived = false;

      if (debtor.isFixed) {
        const receivedMonths = debtor.receivedMonths || [];
        const isReceived = receivedMonths.includes(currentMonthStr);
        becomingReceived = !isReceived;
        const newReceivedMonths = isReceived 
          ? receivedMonths.filter(m => m !== currentMonthStr)
          : [...receivedMonths, currentMonthStr];
        await updateDoc(debtorRef, { receivedMonths: newReceivedMonths });
      } else {
        becomingReceived = !debtor.isReceived;
        await updateDoc(debtorRef, { isReceived: !debtor.isReceived });
      }

      // If it became received, ask if user wants to add to extras
      if (becomingReceived) {
        setDebtorToConfirmExtra(debtor);
        setIsDebtorExtraConfirmModalOpen(true);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleAddDebtorToExtras = async () => {
    if (!user || !debtorToConfirmExtra) return;

    setIsSaving(true);
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    const debtorValue = debtorToConfirmExtra.value;
    
    // Create new Additional Salary
    const salaryData: Omit<AdditionalSalary, 'id'> = {
      description: debtorToConfirmExtra.description + " (lançado dos devedores)",
      value: debtorValue,
      date: debtorToConfirmExtra.isFixed ? adjustDateToMonth(debtorToConfirmExtra.date, currentMonthStr) : debtorToConfirmExtra.date,
      debtorId: debtorToConfirmExtra.id,
      order: (additionalSalaries.length > 0 ? Math.max(...additionalSalaries.map(s => s.order || 0)) : -1) + 1
    };

    const salaryPath = `users/${user.uid}/additionalSalaries`;
    const debtorPath = `users/${user.uid}/debtors/${debtorToConfirmExtra.id}`;

    try {
      const newSalaryId = crypto.randomUUID();
      const batch = writeBatch(db);
      
      // Add to additional salaries
      batch.set(doc(db, salaryPath, newSalaryId), sanitizeData(salaryData));
      
      if (debtorToConfirmExtra.isFixed) {
        const currentAddedMonths = debtorToConfirmExtra.addedToExtraMonths || [];
        batch.update(doc(db, debtorPath), { 
          addedToExtraMonths: [...currentAddedMonths, currentMonthStr] 
        });
      } else {
        batch.update(doc(db, debtorPath), { addedToExtras: true, isReceived: true });
      }

      await batch.commit();
      setIsDebtorExtraConfirmModalOpen(false);
      setDebtorToConfirmExtra(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, salaryPath);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      value: expense.value,
      description: expense.description,
      category: expense.category,
      isFixed: !!expense.isFixed,
      isRecurring: !!expense.isRecurring,
      repeatCount: expense.repeatCount || 1,
      repeatFrequency: expense.repeatFrequency || "monthly",
      notes: expense.notes || "",
      date: expense.date,
      dueDate: expense.dueDate || "",
      calculationType: "monthly",
    });
    setIsAddModalOpen(true);
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

  const handleSendFeedback = async () => {
    if (!user) return;
    if (feedbackRating === 0) {
      alert("Avaliação necessária: Por favor, selecione uma nota de 1 a 5 estrelas.");
      return;
    }
    if (!feedbackMessage.trim()) {
      alert("Mensagem necessária: Por favor, escreva uma breve mensagem.");
      return;
    }

    setIsSendingFeedback(true);
    const feedbackPath = `feedbacks/${user.uid}`;
    try {
      await setDoc(doc(db, feedbackPath), {
        userId: user.uid,
        userName: user.displayName || 'Usuário',
        userEmail: user.email,
        stars: feedbackRating,
        message: feedbackMessage,
        updatedAt: new Date().toISOString()
      });
      alert("Feedback enviado! Obrigado por nos ajudar a melhorar o Orin.");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, feedbackPath);
    } finally {
      setIsSendingFeedback(false);
    }
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
      dueDate: "",
      calculationType: "monthly",
    });
    setEditingExpense(null);
    setValidationError(null);
  };

  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('app-zoom-level');
    return saved ? parseFloat(saved) : 1;
  });

  useEffect(() => {
    localStorage.setItem('app-zoom-level', zoomLevel.toString());
  }, [zoomLevel]);

  const formatCurrency = (value: number) => {
    const { symbol, amount } = formatCurrencyParts(value);
    return `${symbol} ${amount}`;
  };

  const getEfficiencyMessage = (efficiency: number) => {
    if (efficiency <= 10) return "Você está descontrolado";
    if (efficiency <= 40) return "lutando pelo controle";
    if (efficiency <= 50) return "perto do controle";
    if (efficiency <= 70) return "retomando o controle";
    return "Parabéns, você está no controle";
  };

  const changeMonth = (offset: number) => {
    const nextDate = new Date(currentDate);
    nextDate.setMonth(currentDate.getMonth() + offset);
    setCurrentDate(nextDate);
  };

  const monthName = currentDate.toLocaleString("pt-BR", { month: "long" });
  const year = currentDate.getFullYear();

  // Calculate Global Approval Rate from feedbacks
  const feedbackStats = useMemo(() => {
    if (feedbacks.length === 0) return { average: 0, count: 0, approvalRate: 0 };
    const totalStars = feedbacks.reduce((acc, curr) => acc + curr.stars, 0);
    const average = totalStars / feedbacks.length;
    const approvalRate = (totalStars / (feedbacks.length * 5)) * 100;
    return { average, count: feedbacks.length, approvalRate };
  }, [feedbacks]);

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

      const mOverride = monthlySalaries[mStr];
      const mSalary = mOverride ? mOverride.salary : baseSalary;
      const mSecondary = mOverride ? mOverride.secondarySalary : baseSecondarySalary;
      const mThirteenth1 = mOverride && mOverride.thirteenth1 !== undefined ? mOverride.thirteenth1 : baseThirteenth1;
      const mThirteenth2 = mOverride && mOverride.thirteenth2 !== undefined ? mOverride.thirteenth2 : baseThirteenth2;

      const grossMonthIncome = mSalary + mSecondary + mThirteenth1 + mThirteenth2 + mAdditional;
      
      let mDiscount = 0;
      tributes.forEach(t => {
        if (t.enabled) {
          if (t.base === 'main') {
            mDiscount += (mSalary + mThirteenth1 + mThirteenth2 + mSecondary) * (t.percentage / 100);
          } else {
            mDiscount += grossMonthIncome * (t.percentage / 100);
          }
        }
      });
      
      const monthTotalIncome = grossMonthIncome - mDiscount;
      const monthBalance = monthTotalIncome - mExpenses;
      const monthEfficiency = monthTotalIncome > 0 ? Math.max(0, Math.round((monthBalance / monthTotalIncome) * 100)) : 0;

      monthlyData.push({
        name: mLabel,
        despesas: mExpenses,
        rendimentos: monthTotalIncome,
        extra: mAdditional,
        efficiency: monthEfficiency
      });

      tempDate.setMonth(tempDate.getMonth() + 1);
    }

    // Category Data
    const categoryTotals: Record<string, { total: number, count: number }> = {};
    periodExpenses.forEach(e => {
      if (!categoryTotals[e.category]) {
        categoryTotals[e.category] = { total: 0, count: 0 };
      }
      categoryTotals[e.category].total += e.value;
      categoryTotals[e.category].count += 1;
    });

    const pieData = Object.entries(categoryTotals)
      .map(([name, data]) => ({ name, value: data.total, count: data.count }))
      .sort((a, b) => b.value - a.value);

    const totalExpenses = pieData.reduce((acc, curr) => acc + curr.value, 0);

    const COLORS = ['#4ade80', '#60a5fa', '#f87171', '#fbbf24', '#a78bfa', '#f472b6', '#2dd4bf', '#fb923c'];

    return { monthlyData, pieData, totalExpenses, COLORS, periodAdditionalSalaries };
  }, [expenses, additionalSalaries, salary, reportRange]);

  return (
    <>
      {/* Update Prompt */}
      {needRefresh && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md overflow-hidden bg-[#0A1A2F] border border-blue-500/20 rounded-3xl shadow-2xl relative"
          >
            {/* Header/Banner visual */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-blue-500/20 to-transparent pointer-events-none" />
            <div className="absolute top-[-50%] left-[-50%] right-[-50%] bottom-[-50%] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay pointer-events-none" />

            <div className="relative p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-500 to-cyan-400 p-[1px] shadow-lg shadow-blue-500/30 shrink-0">
                  <div className="w-full h-full bg-[#0A1A2F] rounded-[15px] flex items-center justify-center">
                    <Download className="w-6 h-6 text-blue-400" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white leading-tight">
                    {appUpdateInfo?.title || 'Atualização Disponível'}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 font-bold px-2 py-0.5">
                      v{appUpdateInfo?.version || 'Nova'}
                    </Badge>
                    {appUpdateInfo?.isMandatory && (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-bold px-2 py-0.5 text-[10px] uppercase">
                        Obrigatória
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-2">
                <h4 className="font-bold text-white/90 text-sm">O que há de novo:</h4>
                <div className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
                  {appUpdateInfo?.changelog || 'Melhorias de estabilidade e novas funcionalidades.'}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                {(!appUpdateInfo || !appUpdateInfo.isMandatory) && (
                  <Button 
                    variant="ghost" 
                    className="flex-1 rounded-2xl border border-white/10 hover:bg-white/5 h-12 text-white/70 font-bold"
                    onClick={() => setNeedRefresh(false)}
                  >
                    Agora Não
                  </Button>
                )}
                <Button 
                  className={cn(
                    "rounded-2xl h-12 font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                    (!appUpdateInfo || !appUpdateInfo.isMandatory) ? "flex-1 bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/20" : "w-full bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/20"
                  )}
                  onClick={async () => {
                    try {
                      if (updateSWFn) await updateSWFn(true);
                    } catch(e) {}
                    if ('serviceWorker' in navigator) {
                      const registrations = await navigator.serviceWorker.getRegistrations();
                      for (let registration of registrations) registration.unregister();
                      const names = await caches.keys();
                      for (let name of names) caches.delete(name);
                    }
                    window.location.reload();
                  }}
                >
                  <RefreshCw className="w-5 h-5" />
                  Baixar e Atualizar
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

    <div className={cn(
      "min-h-screen text-white p-4 md:p-8 overflow-x-hidden relative",
    )}>
      {/* Dynamic Glassmorphism Background */}
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
        {/* Colorful shapes */}
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-indigo-500/40 rounded-full mix-blend-color-dodge filter blur-[100px] opacity-70 animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[70vw] h-[70vw] bg-rose-500/40 rounded-full mix-blend-color-dodge filter blur-[120px] opacity-70" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[20%] left-[50%] w-[50vw] h-[50vw] bg-emerald-500/40 rounded-full mix-blend-color-dodge filter blur-[100px] opacity-60" style={{ animationDelay: '1s' }} />
        {/* Background base and deep blur */}
        <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-[80px]" />
      </div>

      <div 
        className="max-w-3xl mx-auto w-full space-y-6 pb-24 pt-24 relative z-10"
        style={{ zoom: zoomLevel } as React.CSSProperties}
      >
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
              <div className="liquid-glass p-4 rounded-3xl inline-block mx-auto relative group max-w-[200px] max-h-[200px]">
                {systemConfig.appIconUrl ? (
                  <img 
                    src={systemConfig.appIconUrl} 
                    alt="App Icon" 
                    className="max-w-full max-h-[120px] rounded-2xl object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Wallet className="w-16 h-16 text-white" />
                )}
              </div>
              <h1 className="text-4xl font-bold tracking-tight">Orin - A organização inteligente</h1>
              <p className="text-white/70 max-w-xs mx-auto">
                Seu controle financeiro inteligente, sincronizado em todos os seus dispositivos.
              </p>
            </div>
            
            <Button 
              onClick={signInWithGoogle}
              className="bg-white text-[#04142c] hover:bg-white/90 font-bold px-8 py-6 rounded-2xl text-lg shadow-2xl flex items-center gap-3 transition-all hover:scale-105"
            >
              <LogIn className="w-6 h-6" />
              Entrar com Google
            </Button>
            
            <div className="text-xs text-white/40 max-w-[200px] space-y-2">
              <p>Ao entrar, seus dados serão salvos com segurança na nuvem.</p>
              <p className="text-blue-300/60">Dica: Você pode instalar este app no seu celular para acesso rápido!</p>
            </div>
          </motion.div>
        ) : !isAdmin && (appUserStatus === 'pending' || appUserStatus === 'rejected') ? (
          /* Blocked Screen */
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center min-h-[80vh] space-y-8 text-center"
          >
            <div className="space-y-4">
              <div className="liquid-glass p-6 rounded-3xl inline-block mx-auto relative group">
                <ShieldAlert className="w-16 h-16 text-yellow-500" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">O acesso não foi autorizado</h1>
              <p className="text-white/70 max-w-sm mx-auto">
                {appUserStatus === 'pending' 
                  ? "Sua conta está aguardando aprovação. Um administrador precisa liberar seu acesso." 
                  : "Sua solicitação de acesso foi recusada. Você pode tentar reenviar o pedido."}
              </p>
            </div>
            
            <div className="flex flex-col gap-4 w-full max-w-xs">
              {appUserStatus === 'rejected' && (
                <Button 
                  onClick={() => handleUpdateAppUserStatus(user.uid, 'pending')}
                  className="bg-blue-500 text-white hover:bg-blue-600 font-bold px-8 py-6 rounded-2xl text-lg shadow-2xl flex items-center justify-center gap-3 transition-all hover:scale-105"
                >
                  Enviar Novo Pedido
                </Button>
              )}
              
              <Button 
                onClick={logout}
                variant="outline"
                className="bg-transparent border-white/20 text-white hover:bg-white/10 font-bold px-8 py-6 rounded-2xl text-lg flex items-center justify-center gap-3"
              >
                <LogOut className="w-6 h-6" />
                Sair
              </Button>
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
                <div className="relative group">
                  <div className="liquid-glass p-1 rounded-xl overflow-hidden min-w-[48px] min-h-[48px] max-w-[120px] max-h-[120px] flex items-center justify-center w-fit h-fit">
                    {userPhotoUrl || systemConfig.appIconUrl ? (
                      <img 
                        src={userPhotoUrl || systemConfig.appIconUrl} 
                        alt="Profile" 
                        className="max-w-full max-h-full object-contain rounded-lg"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <UserIcon className="w-6 h-6 text-white/50" />
                    )}
                  </div>
                  {user && (
                    <label className="absolute inset-0 flex items-center justify-center bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-xl">
                      <Camera className="w-5 h-5 text-white" />
                      <input type="file" className="hidden" accept="image/*" onChange={handleProfilePhotoUpload} />
                    </label>
                  )}
                </div>
                  <div>
                    <div className="flex items-center gap-2">
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
                {showInstallButton && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleInstallClick}
                    className="h-10 w-10 rounded-xl bg-white/10 text-yellow-400 hover:bg-yellow-500/20 hover:text-yellow-200"
                    title="Instalar App"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </motion.header>

            {activeTab === "home" ? (
              <>
                <div className="space-y-6">

                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
                    <Card className="liquid-glass text-white overflow-hidden relative p-4 rounded-2xl h-full flex flex-col justify-between">
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <ArrowUpCircle className="w-8 h-8" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-white/70 uppercase mb-1 tracking-widest">Rendimentos</div>
                        <div className="flex items-baseline gap-1 mb-2">
                          <span className="text-[10px] opacity-50 font-bold">R$</span>
                          <div className="text-lg sm:text-xl font-bold truncate">{formatCurrencyParts(totalIncome).amount}</div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1 border-t border-white/5 pt-2">
                        <div 
                          className="flex justify-between items-center text-[10px] sm:text-[12px] uppercase tracking-tight cursor-pointer hover:bg-white/10 p-1.5 rounded-lg transition-all group"
                          onClick={() => {
                            setTempSalary(salary);
                            setTempSecondarySalary(secondarySalary);
                            setTempThirteenth1(thirteenth1);
                            setTempThirteenth2(thirteenth2);
                            setIsSalaryModalOpen(true);
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-white/40 group-hover:text-white/70 transition-colors">Salários:</span>
                            {isSavingSalary && (
                              <div className="w-2.5 h-2.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            )}
                          </div>
                          <span className="text-white/60 font-bold group-hover:text-white transition-colors">{formatCurrency(salary + secondarySalary + thirteenth1 + thirteenth2)}</span>
                        </div>
                        <div 
                          className="flex justify-between items-center text-[10px] sm:text-[12px] uppercase tracking-tight cursor-pointer hover:bg-white/10 p-1.5 rounded-lg transition-all group"
                          onClick={() => setIsAdditionalSalaryListModalOpen(true)}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-white/40 group-hover:text-white/70 transition-colors">Extras:</span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => { e.stopPropagation(); resetAdditionalSalaryForm(); setIsAdditionalSalaryModalOpen(true); }}
                              className="h-4 w-4 rounded-full bg-white/10 text-white hover:bg-white/20 ml-1"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </Button>
                          </div>
                          <span className="text-white/60 font-bold group-hover:text-white transition-colors">{formatCurrency(totalAdditionalSalary)}</span>
                        </div>
                      </div>
                    </Card>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
                    <Card 
                      className={cn(
                        "liquid-glass text-white overflow-hidden relative p-4 rounded-2xl h-full flex flex-col justify-between transition-all duration-300",
                        tributes.every(t => !t.enabled) && "opacity-60"
                      )}
                    >
                      <div className="flex justify-between items-start mb-2 relative z-10 w-full">
                        <div className="flex flex-col w-full">
                          <div className="text-[10px] font-bold text-white/70 uppercase tracking-widest flex items-center justify-between w-full">
                            Tributos
                            <Button
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => { e.stopPropagation(); setEditingTribute(null); setIsTributeModalOpen(true); }}
                              className="h-4 w-4 rounded-full bg-white/10 text-white hover:bg-white/20 ml-1"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-baseline gap-1 overflow-hidden">
                          <span className="text-[10px] opacity-50 font-bold">- R$</span>
                          <div className="text-lg sm:text-xl font-bold truncate text-red-300">
                            {totalTributesDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 border-t border-white/5 pt-3 mt-2 flex-1">
                        {tributes.map(tribute => (
                          <div key={tribute.id} className="flex justify-between items-center text-[10px] sm:text-[12px] uppercase tracking-tight group">
                            <span 
                              className="text-white/40 group-hover:text-white/70 transition-colors flex items-center gap-1 cursor-pointer" 
                              onClick={() => { setEditingTribute(tribute); setIsTributeModalOpen(true); }}
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                              {tribute.name} ({tribute.percentage}%)
                            </span>
                            <div className="flex items-center gap-2">
                              {tribute.enabled && (
                                <span className="text-red-400 font-bold text-[9px] sm:text-[10px]">
                                  -{formatCurrency(tribute.base === 'main' ? salary * (tribute.percentage/100) : grossIncome * (tribute.percentage/100))}
                                </span>
                              )}
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleToggleTribute(tribute.id, !tribute.enabled); }}
                                className={cn(
                                  "w-6 h-3 sm:w-8 sm:h-4 rounded-full relative transition-colors duration-200 flex-shrink-0",
                                  tribute.enabled ? "bg-red-500" : "bg-white/10"
                                )}
                              >
                                <motion.div 
                                  animate={{ x: tribute.enabled ? (typeof window !== 'undefined' && window.innerWidth < 640 ? 12 : 16) : 2 }}
                                  className="w-2 h-2 sm:w-3 sm:h-3 bg-white rounded-full absolute top-0.5"
                                />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
                    <Card className="liquid-glass text-white overflow-hidden relative p-4 rounded-2xl h-full">
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <ArrowDownCircle className="w-8 h-8" />
                      </div>
                      <div className="text-[10px] font-bold text-white/70 uppercase mb-1 tracking-widest">A Pagar</div>
                      <div className="flex items-baseline gap-1 text-red-300 mb-2">
                        <span className="text-xs opacity-50 font-bold">R$</span>
                        <div className="text-xl font-bold truncate">{formatCurrencyParts(totalRemainingExpenses).amount}</div>
                      </div>
                      <div className="flex flex-col gap-1 border-t border-white/5 pt-2">
                        <div className="flex justify-between text-[17px] uppercase tracking-tight">
                          <span className="text-white/40">Pago:</span>
                          <span className="text-green-400 font-bold">{formatCurrency(totalPaidExpenses)}</span>
                        </div>
                        <div className="flex justify-between text-[17px] uppercase tracking-tight">
                          <span className="text-white/40">Total:</span>
                          <span className="text-white/60 font-medium">{formatCurrency(totalMonthlyExpenses)}</span>
                        </div>
                      </div>
                    </Card>
                  </motion.div>

                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    transition={{ delay: 0.3 }}
                  >
                    <Card className="liquid-glass text-white overflow-hidden relative p-4 rounded-2xl h-full">
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <Wallet className="w-8 h-8" />
                      </div>
                      <div className="text-[10px] font-bold text-white/70 uppercase mb-1 tracking-widest">Saldo</div>
                      <div className={cn("flex items-baseline gap-1", balance >= 0 ? "text-green-300" : "text-red-400")}>
                        <span className="text-xs opacity-50 font-bold">R$</span>
                        <div className="text-xl font-bold truncate">{formatCurrencyParts(balance).amount}</div>
                      </div>

                      {/* Savings Progress Bar */}
                      <div className="mt-4 space-y-1.5">
                        <div className="flex justify-between items-center text-[8px] uppercase font-bold tracking-widest text-white/30">
                          <span>Eficiência Financeira</span>
                          <span>{totalIncome > 0 ? Math.max(0, Math.round((balance / totalIncome) * 100)) : 0}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ 
                              width: `${totalIncome > 0 ? Math.max(0, Math.min(100, (balance / totalIncome) * 100)) : 0}%`,
                              backgroundColor: balance >= 0 ? "rgba(96, 165, 250, 0.8)" : "rgba(248, 113, 113, 0.5)"
                            }}
                            transition={{ type: "spring", stiffness: 50, damping: 20 }}
                            className="h-full rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                          />
                        </div>
                      </div>

                      {balanceMessage && (
                        <div className="mt-2 text-[10px] text-white/60 italic leading-tight border-t border-white/5 pt-2">
                          {balanceMessage}
                        </div>
                      )}
                    </Card>
                  </motion.div>
                </div>


            {/* Fixed Expenses Card */}
            {fixedExpenses.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="liquid-glass rounded-3xl overflow-hidden"
              >
                <div 
                  className="w-full p-6 border-b border-white/10 flex justify-between items-center transition-colors"
                >
                  <button
                    onClick={() => setIsFixedExpensesExpanded(!isFixedExpensesExpanded)}
                    className="flex-1 flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                  >
                    <h2 className="text-xl font-bold">Despesas Fixas</h2>
                    <motion.div
                      animate={{ rotate: isFixedExpensesExpanded ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronDown className="w-5 h-5 text-white/50" />
                    </motion.div>
                  </button>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-bold text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
                      {formatCurrency(fixedExpenses.reduce((sum, exp) => sum + exp.value, 0))}
                    </div>
                    <Badge variant="outline" className="text-white border-white/30">
                      {fixedExpenses.length} itens
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkAllFixedPaid();
                    }}
                    className="h-8 text-[10px] uppercase font-bold text-blue-300 hover:text-blue-200 hover:bg-blue-300/10 gap-1.5"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Pagar Todas
                  </Button>
                </div>
                <AnimatePresence initial={false}>
                  {isFixedExpensesExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 space-y-6">
                        {(() => {
                          const grouped: { [key: string]: Expense[] } = {};
                          fixedExpenses.forEach(e => {
                            const dateKey = e.date.split('T')[0];
                            if (!grouped[dateKey]) grouped[dateKey] = [];
                            grouped[dateKey].push(e);
                          });

                          return Object.keys(grouped).sort().map(dateStr => {
                            const date = new Date(dateStr + "T12:00:00");
                            const dayOfWeek = date.toLocaleString('pt-BR', { weekday: 'long' });
                            const formattedDate = formatDate(dateStr);
                            const dailyTotal = grouped[dateStr].reduce((sum, exp) => sum + exp.value, 0);

                            return (
                              <div key={dateStr} className="space-y-3">
                                <div className="flex items-center gap-3">
                                  <div className="h-px flex-1 bg-white/10" />
                                  <div className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-2">
                                    <CalendarIcon className="w-3 h-3" />
                                    {formattedDate} • <span className="text-blue-300 capitalize">{dayOfWeek}</span> • <span className="text-green-400 font-bold">{formatCurrency(dailyTotal)}</span>
                                  </div>
                                  <div className="h-px flex-1 bg-white/10" />
                                </div>
                                <div className="space-y-3">
                                  {grouped[dateStr].map(expense => (
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
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Variable Expenses List */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="liquid-glass rounded-3xl overflow-hidden"
            >
              <div 
                className="w-full p-6 border-b border-white/10 flex justify-between items-center transition-colors"
              >
                <button
                  onClick={() => setIsVariableExpensesExpanded(!isVariableExpensesExpanded)}
                  className="flex-1 flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                >
                  <h2 className="text-xl font-bold">Despesas</h2>
                  <motion.div
                    animate={{ rotate: isVariableExpensesExpanded ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ChevronDown className="w-5 h-5 text-white/50" />
                  </motion.div>
                </button>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-bold text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
                    {formatCurrency(variableExpenses.reduce((sum, exp) => sum + exp.value, 0))}
                  </div>
                  <Badge variant="outline" className="text-white border-white/30">
                    {variableExpenses.length} itens
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkAllVariablePaid();
                    }}
                    className="h-8 text-[10px] uppercase font-bold text-blue-300 hover:text-blue-200 hover:bg-blue-300/10 gap-1.5"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Pagar Todas
                  </Button>
                </div>
              </div>
              
              <AnimatePresence initial={false}>
                {isVariableExpensesExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="p-6">
                      <div className="space-y-6">
                        {variableExpenses.length === 0 ? (
                          <div className="text-center py-12 text-white/50">
                            Nenhuma despesa para este mês.
                          </div>
                        ) : (
                          (() => {
                            // Group expenses by week
                            const weeks: Record<string, Expense[]> = {
                              "Semana 1 (01-07)": [],
                              "Semana 2 (08-14)": [],
                              "Semana 3 (15-21)": [],
                              "Semana 4 (22+)": [],
                            };
                            
                            variableExpenses.forEach(e => {
                              const day = parseInt(e.date.split('-')[2]);
                              if (day <= 7) weeks["Semana 1 (01-07)"].push(e);
                              else if (day <= 14) weeks["Semana 2 (08-14)"].push(e);
                              else if (day <= 21) weeks["Semana 3 (15-21)"].push(e);
                              else weeks["Semana 4 (22+)"].push(e);
                            });

                            return Object.keys(weeks).map(weekName => {
                              const weekExpenses = weeks[weekName];
                              if (weekExpenses.length === 0) return null;
                              
                              const weekTotal = weekExpenses.reduce((sum, exp) => sum + exp.value, 0);

                              return (
                                <div key={weekName} className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <div className="h-px flex-1 bg-white/10" />
                                    <div className="text-[10px] uppercase font-bold text-white/40 tracking-widest flex items-center gap-2">
                                      <CalendarIcon className="w-3 h-3" />
                                      {weekName} • <span className="text-green-400 font-bold">{formatCurrency(weekTotal)}</span>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleMarkWeekPaid(weekExpenses)}
                                      className="h-7 text-[9px] uppercase font-bold text-blue-300 hover:text-blue-200 hover:bg-blue-300/10 px-2 flex items-center gap-1.5"
                                    >
                                      <CheckCircle className="w-3 h-3" />
                                      Pagar Semana
                                    </Button>
                                    <div className="h-px flex-1 bg-white/10" />
                                  </div>
                                  <div className="space-y-3">
                                    {weekExpenses.map(expense => {
                                      let installmentInfo = "";
                                      if (expense.isRecurring && expense.repeatCount && expense.repeatCount > 1) {
                                        if (expense.installmentIndex) {
                                          installmentInfo = `${expense.installmentIndex}x${expense.repeatCount}`;
                                        } else if (expense.parentId) {
                                          const siblings = expenses
                                            .filter(e => e.parentId === expense.parentId)
                                            .sort((a, b) => a.date.localeCompare(b.date));
                                          const index = siblings.findIndex(s => s.id === expense.id);
                                          if (index !== -1) {
                                            installmentInfo = `${index + 1}x${expense.repeatCount}`;
                                          }
                                        }
                                      }
                                      return (
                                        <ExpenseItem
                                          key={`${expense.id}-${currentDate.toISOString().slice(0, 7)}`}
                                          expense={expense}
                                          currentMonthStr={currentDate.toISOString().slice(0, 7)}
                                          onTogglePaid={handleTogglePaid}
                                          onEdit={handleEditExpense}
                                          onDelete={handleDeleteExpense}
                                          formatCurrency={formatCurrency}
                                          formatDate={formatDate}
                                          installmentInfo={installmentInfo}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            });
                          })()
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
          </>
        ) : activeTab === "debtors" ? (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="space-y-6 pb-32"
          >
            {/* Summary Cards and PIX Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="grid grid-cols-2 gap-3 md:col-span-2">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                  <Card className="liquid-glass text-white overflow-hidden relative p-4 rounded-2xl h-full">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                      <UserIcon className="w-8 h-8" />
                    </div>
                    <div className="text-[10px] font-bold text-white/70 uppercase mb-1 tracking-widest">A Receber</div>
                    <div className="text-xl font-bold truncate text-blue-300">
                      {formatCurrency(totalDebtors - totalReceivedDebtors)}
                    </div>
                    <div className="text-[10px] font-medium text-white/50 mt-1 uppercase tracking-wider">
                      {pendingDebtorsCount} {pendingDebtorsCount === 1 ? 'restante' : 'restantes'}
                    </div>
                    <div className="mt-3 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${100 - debtorsReceivedPercentage}%` }}
                        className="h-full bg-blue-400"
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </Card>
                </motion.div>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
                  <Card className="liquid-glass text-white overflow-hidden relative p-4 rounded-2xl h-full">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                      <Check className="w-8 h-8" />
                    </div>
                    <div className="text-[10px] font-bold text-white/70 uppercase mb-1 tracking-widest">Recebido</div>
                    <div className="text-xl font-bold truncate text-green-300">
                      {formatCurrency(totalReceivedDebtors)}
                    </div>
                    <div className="text-[10px] font-medium text-white/50 mt-1 uppercase tracking-wider">
                      {receivedDebtorsCount} {receivedDebtorsCount === 1 ? 'recebido' : 'recebidos'}
                    </div>
                    <div className="mt-3 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${debtorsReceivedPercentage}%` }}
                        className="h-full bg-green-400"
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </Card>
                </motion.div>
              </div>

              {/* PIX Card */}
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
                <Card className="liquid-glass text-white overflow-hidden relative p-4 rounded-2xl h-full border-l-4 border-l-blue-400">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Minha Chave PIX</div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setIsEditingPix(!isEditingPix)}
                      className="h-6 w-6 text-white/50 hover:text-white hover:bg-white/10"
                    >
                      {isEditingPix ? <X className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
                    </Button>
                  </div>
                  
                  {isEditingPix ? (
                    <div className="flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-200">
                      <Input 
                        value={pixKey}
                        onChange={(e) => setPixKey(e.target.value)}
                        placeholder="Chave PIX (CPF, E-mail, etc)"
                        className="h-8 bg-white/10 border-white/20 text-xs text-white"
                      />
                      <Input 
                        value={pixBank}
                        onChange={(e) => setPixBank(e.target.value)}
                        placeholder="Banco"
                        className="h-8 bg-white/10 border-white/20 text-xs text-white"
                      />
                      <Input 
                        value={pixResponsible}
                        onChange={(e) => setPixResponsible(e.target.value)}
                        placeholder="Responsável"
                        className="h-8 bg-white/10 border-white/20 text-xs text-white"
                      />
                      <Button 
                        size="sm" 
                        onClick={() => { savePixData(pixKey, pixBank, pixResponsible); setIsEditingPix(false); }}
                        className="h-8 bg-blue-500 hover:bg-blue-600 text-white w-full"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Salvar
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-mono font-bold truncate text-blue-100 flex-1">
                          {pixKey || <span className="text-white/30 font-sans italic font-normal">Não cadastrada</span>}
                        </div>
                        {pixKey && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={copyPixToClipboard}
                            className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
                            title="Copiar PIX"
                          >
                            {pixCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                      </div>
                      {(pixBank || pixResponsible) && (
                        <div className="flex flex-col text-[10px] text-white/50 uppercase tracking-tighter">
                          {pixBank && <span>Banco: <span className="text-white/80">{pixBank}</span></span>}
                          {pixResponsible && <span>Resp: <span className="text-white/80">{pixResponsible}</span></span>}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </motion.div>
            </div>


            {/* Fixed Debtors Card */}
            {fixedDebtors.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="liquid-glass rounded-3xl overflow-hidden"
              >
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                  <h2 className="text-xl font-bold">Devedores Fixos</h2>
                  <Badge variant="outline" className="text-white border-white/30">
                    {fixedDebtors.length} itens
                  </Badge>
                </div>
                <div className="p-6 space-y-3">
                  {fixedDebtors.map((debtor) => (
                    <DebtorItem
                      key={`${debtor.id}-${currentDate.toISOString().slice(0, 7)}`}
                      debtor={debtor}
                      currentMonthStr={currentDate.toISOString().slice(0, 7)}
                      onToggleReceived={handleToggleDebtorReceived}
                      onEdit={handleEditDebtor}
                      onDelete={handleDeleteDebtor}
                      formatCurrency={formatCurrency}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Variable Debtors Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="liquid-glass rounded-3xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">Devedores do Mês</h2>
                  <Badge variant="outline" className="text-white border-white/30">
                    {variableDebtors.length} itens
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => { resetDebtorForm(); setIsDebtorModalOpen(true); }}
                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded-xl h-10 text-xs font-bold transition-all shadow-lg"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Devedor
                  </Button>
                  <Button 
                    onClick={() => setIsBillingModalOpen(true)}
                    variant="outline"
                    className="flex-1 border-white/20 bg-white/10 hover:bg-white/20 text-white rounded-xl h-10 text-xs font-bold transition-all"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Gerar Cobrança
                  </Button>
                </div>
              </div>
              <div className="p-6">
                {variableDebtors.length > 0 ? (
                  <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                      {variableDebtors.map((debtor) => (
                        <DebtorItem
                          key={debtor.id}
                          debtor={debtor}
                          currentMonthStr={currentDate.toISOString().slice(0, 7)}
                          onToggleReceived={handleToggleDebtorReceived}
                          onEdit={handleEditDebtor}
                          onDelete={handleDeleteDebtor}
                          formatCurrency={formatCurrency}
                          formatDate={formatDate}
                          installmentInfo={debtor.isRecurring ? `${debtor.installmentIndex}/${debtor.repeatCount}` : undefined}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="text-center py-12 bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <div className="bg-white/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                      <TrendingUp className="w-6 h-6 text-white/40" />
                    </div>
                    <p className="text-white/40 font-medium">Nenhum devedor este mês</p>
                    <p className="text-[10px] text-white/20 mt-1 uppercase tracking-widest">Clique em "Novo Devedor" para começar</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : activeTab === "report" ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Report Controls */}
            <div className="liquid-glass p-6 rounded-3xl space-y-4">
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
                    className="bg-white/10 border-white/10 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-white/60 uppercase font-bold">Mês Final</Label>
                  <Input 
                    type="month" 
                    value={reportRange.end}
                    onChange={(e) => setReportRange({ ...reportRange, end: e.target.value })}
                    className="bg-white/10 border-white/10 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Monthly Comparison Chart */}
            <div className="liquid-glass p-6 rounded-3xl">
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
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#04142c', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px' }}
                      itemStyle={{ fontSize: '12px' }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '10px' }} />
                    <Bar dataKey="rendimentos" name="Rendimentos" fill="#4ade80" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" name="Despesas" fill="#f87171" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Efficiency Overview Period */}
            <div 
              className="liquid-glass p-6 rounded-3xl cursor-pointer transition-all hover:bg-white/5 group border border-white/10"
              onClick={() => setIsEfficiencyExpanded(!isEfficiencyExpanded)}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="bg-blue-500/20 p-2 rounded-xl">
                    <Target className="w-5 h-5 text-blue-400" />
                  </div>
                  <h2 className="text-lg font-bold">Eficiência Média</h2>
                </div>
                <motion.div
                  animate={{ rotate: isEfficiencyExpanded ? 180 : 0 }}
                  className="text-white/40 group-hover:text-white/70"
                >
                  <ChevronDown className="w-5 h-5" />
                </motion.div>
              </div>

              {/* Summary View */}
              {(() => {
                const latest = reportData.monthlyData[reportData.monthlyData.length - 1];
                const previous = reportData.monthlyData[reportData.monthlyData.length - 2];
                const efficiencyMsg = latest ? getEfficiencyMessage(latest.efficiency) : "";
                
                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {latest && (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Mês Atual</span>
                              <span className="text-sm font-bold text-white/80">{latest.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-2xl font-black text-white">{latest.efficiency}%</span>
                            </div>
                          </div>
                          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${latest.efficiency}%` }}
                              className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                latest.efficiency > 70 ? "bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]" : 
                                latest.efficiency > 40 ? "bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]" : 
                                "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                              )}
                            />
                          </div>
                          <div className="flex items-center gap-2 bg-white/5 py-2 px-3 rounded-xl shadow-inner shadow-white/5">
                            <div className={cn(
                              "w-2 h-2 rounded-full animate-pulse",
                              latest.efficiency > 70 ? "bg-green-500" : 
                              latest.efficiency > 40 ? "bg-blue-500" : 
                              "bg-red-500"
                            )} />
                            <span className="text-xs font-bold text-white/70 italic text-center flex-1 lowercase truncate">"{efficiencyMsg}"</span>
                          </div>
                        </div>
                      )}

                      {previous && (
                        <div className="space-y-3 opacity-60">
                          <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Mês Anterior</span>
                              <span className="text-sm font-bold text-white/80">{previous.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-xl font-bold text-white/70">{previous.efficiency}%</span>
                            </div>
                          </div>
                          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${previous.efficiency}%` }}
                              className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                previous.efficiency > 70 ? "bg-green-500" : 
                                previous.efficiency > 40 ? "bg-blue-500" : 
                                "bg-red-500"
                              )}
                            />
                          </div>
                          {latest && (
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[10px] uppercase font-bold text-white/30">Comparativo</span>
                              <div className={cn(
                                "flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-white/5",
                                latest.efficiency >= previous.efficiency ? "text-green-400" : "text-red-400"
                              )}>
                                {latest.efficiency >= previous.efficiency ? <TrendingUp className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                                {Math.abs(latest.efficiency - previous.efficiency)}%
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <AnimatePresence>
                      {isEfficiencyExpanded && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="overflow-hidden border-t border-white/5 pt-6 space-y-4"
                        >
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-4">Histórico de Eficiência (6 Meses)</div>
                          <div className="space-y-4 pb-2">
                            {[...reportData.monthlyData].reverse().slice(0, 6).map((month, idx) => (
                              <div key={idx} className="space-y-2 group/item">
                                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                                  <div className="flex items-center gap-2">
                                    <span className="text-white/60 group-hover/item:text-white transition-colors">{month.name}</span>
                                    {idx === 0 && <span className="text-[8px] px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full font-black border border-blue-500/30">ATUAL</span>}
                                  </div>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-md text-[10px] font-black",
                                    month.efficiency > 70 ? "bg-green-500/10 text-green-400" : 
                                    month.efficiency > 40 ? "bg-blue-500/10 text-blue-400" : 
                                    "bg-red-500/10 text-red-400"
                                  )}>
                                    {month.efficiency}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${month.efficiency}%` }}
                                    className={cn(
                                      "h-full rounded-full transition-all duration-1000 opacity-60 group-hover/item:opacity-100",
                                      month.efficiency > 70 ? "bg-green-500" : 
                                      month.efficiency > 40 ? "bg-blue-500" : 
                                      "bg-red-500"
                                    )}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Category Breakdown */}
              <div className="liquid-glass p-6 rounded-3xl">
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
                        contentStyle={{ backgroundColor: '#04142c', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px' }}
                        itemStyle={{ fontSize: '12px' }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                  {reportData.pieData.map((item, index) => (
                    <div key={item.name} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: reportData.COLORS[index % reportData.COLORS.length] }} />
                        <span className="text-white/70">{item.name}</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-white/20 text-white/50">
                          {item.count} {item.count === 1 ? 'item' : 'itens'}
                        </Badge>
                      </div>
                      <span className="font-bold">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-white/10 mt-2">
                    <span className="text-xs font-bold text-white/90">Total Geral</span>
                    <span className="text-sm font-bold text-blue-300">{formatCurrency(reportData.totalExpenses)}</span>
                  </div>
                </div>
              </div>

              {/* Additional Salaries Period List */}
              <div className="liquid-glass p-6 rounded-3xl flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <ArrowUpCircle className="w-5 h-5 text-green-400" />
                  <h2 className="text-lg font-bold">Extras no Período</h2>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                  {reportData.periodAdditionalSalaries.length > 0 ? (
                    reportData.periodAdditionalSalaries
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(s => (
                      <div key={s.id} className="bg-white/5 p-3 rounded-2xl border border-white/10 flex justify-between items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className="text-sm font-bold truncate">{s.description}</div>
                            {s.debtorId && (
                              <span 
                                className="text-[9px] text-blue-300 hover:text-blue-200 underline cursor-pointer bg-blue-500/10 px-1.5 py-0.5 rounded-full"
                                onClick={() => {
                                  const debtor = debtors.find(d => d.id === s.debtorId);
                                  if (debtor) {
                                    setViewingDebtorInfo(debtor);
                                    setIsDebtorInfoModalOpen(true);
                                  }
                                }}
                              >
                                (lançado dos devedores)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-white/40">{formatDate(s.date)}</div>
                        </div>
                        <div className="text-sm font-bold text-green-300 shrink-0">{formatCurrency(s.value)}</div>
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
        ) : null}

        {activeTab === "settings" && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="liquid-glass p-6 rounded-3xl">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
                <Settings className="w-5 h-5 text-blue-400" />
                Configuração
              </h2>
              
              <div className="space-y-8">
                {/* Visual Area */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-bold text-white/50 uppercase tracking-widest">Visual</h3>
                  
                  {/* Theme Customizer */}
                  <div 
                    className="liquid-glass rounded-2xl border border-white/10 overflow-hidden cursor-pointer group"
                    onClick={() => setIsThemeExpanded(!isThemeExpanded)}
                  >
                    <div className="p-4 flex justify-between items-center bg-white/5 group-hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                          <Palette className="w-5 h-5" />
                        </div>
                        <span className="font-bold">Personalizar Tema</span>
                      </div>
                      <motion.div animate={{ rotate: isThemeExpanded ? 180 : 0 }}>
                        <ChevronDown className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
                      </motion.div>
                    </div>
                    
                    <AnimatePresence>
                      {isThemeExpanded && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-white/10"
                        >
                          <div className="p-4 grid grid-cols-2 gap-3" onClick={e => e.stopPropagation()}>
                            <div 
                              onClick={() => handleThemeChange('default')}
                              className={cn(
                                "flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                                theme === 'default' ? "border-blue-400 bg-blue-500/10" : "border-white/5 hover:border-white/20 hover:bg-white/5"
                              )}
                            >
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#010409] to-[#04142c] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]" />
                              <span className={cn("text-xs font-bold uppercase tracking-widest", theme === 'default' ? "text-blue-300" : "text-white/50")}>Padrão</span>
                            </div>
                            <div 
                              onClick={() => handleThemeChange('dark')}
                              className={cn(
                                "flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                                theme === 'dark' ? "border-blue-400 bg-blue-500/10" : "border-white/5 hover:border-white/20 hover:bg-white/5"
                              )}
                            >
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-black to-zinc-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]" />
                              <span className={cn("text-xs font-bold uppercase tracking-widest", theme === 'dark' ? "text-blue-300" : "text-white/50")}>Escuro</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Scale Controls */}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs font-bold text-white/50 uppercase tracking-widest flex-1">Escala da Interface</span>
                    <Button
                      variant="outline"
                      className="h-10 px-4 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white gap-2"
                      onClick={() => setZoomLevel(prev => Math.max(prev - 0.1, 0.7))}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <div className="w-12 text-center font-bold text-sm text-white">
                      {Math.round(zoomLevel * 100)}%
                    </div>
                    <Button
                      variant="outline"
                      className="h-10 px-4 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white gap-2"
                      onClick={() => setZoomLevel(prev => Math.min(prev + 0.1, 1.5))}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Account Actions */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-bold text-white/50 uppercase tracking-widest">Ações da Conta</h3>
                  <div className="space-y-4">
                    {/* Feedback Section */}
                    <div className="liquid-glass p-5 rounded-3xl border border-white/10 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-yellow-500/20 text-yellow-400">
                          <MessageSquare className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold">Sua Opinião</h4>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-2xl border border-white/5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              onClick={() => setFeedbackRating(star)}
                              className="p-1 transition-all hover:scale-110 active:scale-95 group"
                            >
                              <Star 
                                className={cn(
                                  "w-8 h-8 transition-all duration-300",
                                  feedbackRating >= star ? "text-yellow-400 fill-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" : "text-white/10 group-hover:text-white/30"
                                )} 
                              />
                            </button>
                          ))}
                        </div>
                        
                        {feedbackRating > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-[10px] uppercase font-bold text-center text-yellow-400/70 tracking-[0.2em]"
                          >
                            {feedbackRating === 1 && "Ruim"}
                            {feedbackRating === 2 && "Regular"}
                            {feedbackRating === 3 && "Bom"}
                            {feedbackRating === 4 && "Ótimo"}
                            {feedbackRating === 5 && "Excelente"}
                          </motion.div>
                        )}

                        <Textarea 
                          placeholder="Escreva seu feedback aqui..."
                          value={feedbackMessage}
                          onChange={(e) => setFeedbackMessage(e.target.value)}
                          className="bg-white/5 border-white/10 text-white rounded-2xl resize-none h-28 focus:ring-yellow-400 focus:border-yellow-400/50 transition-all text-sm leading-relaxed"
                        />

                        <Button 
                          onClick={handleSendFeedback}
                          disabled={isSendingFeedback || (feedbackRating === userFeedback?.stars && feedbackMessage === userFeedback?.message)}
                          className={cn(
                            "w-full font-bold rounded-2xl h-14 flex items-center justify-center gap-2 transition-all shadow-lg",
                            (feedbackRating === 0 || !feedbackMessage.trim()) ? "bg-white/5 text-white/20" : "bg-yellow-400 hover:bg-yellow-500 text-black shadow-yellow-400/10"
                          )}
                        >
                          {isSendingFeedback ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                          ) : userFeedback ? "Atualizar Feedback" : "Enviar Feedback"}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <Button 
                        onClick={() => setIsShareModalOpen(true)}
                        className="h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2 font-bold w-full"
                      >
                        <Share2 className="w-5 h-5" />
                        Compartilhar Aplicativo
                      </Button>
                      <Button 
                        onClick={logout}
                        variant="ghost"
                        className="h-14 rounded-2xl text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 font-bold w-full"
                      >
                        <LogOut className="w-5 h-5" />
                        Sair da Conta
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Version Info */}
                <div className="pt-4 border-t border-white/5 flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-white/20 text-[10px] uppercase tracking-widest">
                    <AlertCircle className="w-3 h-3" />
                    <span>Versão {APP_VERSION}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if ('serviceWorker' in navigator) {
                        navigator.serviceWorker.getRegistrations().then(registrations => {
                          for (let registration of registrations) registration.unregister();
                          caches.keys().then(names => {
                            for (let name of names) caches.delete(name);
                          });
                          window.location.reload();
                        });
                      } else {
                        window.location.reload();
                      }
                    }}
                    className="text-[9px] text-white/40 hover:text-white/60 h-6 px-2 rounded-full border border-white/10"
                  >
                    Recarregar para Atualizar
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Top Month Selector */}
        {user && (activeTab === "home" || activeTab === "debtors") && (
          <div className="fixed top-0 left-0 right-0 p-4 flex justify-center z-40">
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-full p-2 flex items-center justify-between gap-2 shadow-2xl min-w-[200px] sm:min-w-[260px]"
            >
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => changeMonth(-1)} 
                className="text-white hover:bg-white/10 h-12 w-12 rounded-full transition-all active:scale-95"
                title="Mês Anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              
              <div className="text-center min-w-[80px] sm:min-w-[120px]">
                <div className="text-[10px] uppercase font-bold text-white/50 tracking-widest leading-none mb-0.5">{year}</div>
                <div className="text-lg font-bold capitalize leading-none">{monthName}</div>
              </div>
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => changeMonth(1)} 
                className="text-white hover:bg-white/10 h-12 w-12 rounded-full transition-all active:scale-95"
                title="Próximo Mês"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </motion.div>
          </div>
        )}

        {/* Navigation Bar (Mobile Friendly) */}
        {user && (
          <div className="fixed bottom-0 left-0 right-0 p-4 flex justify-center z-40">
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-full p-2 flex items-center gap-1 shadow-2xl">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setActiveTab("home")}
                className={cn("w-12 h-12 rounded-full transition-all", activeTab === "home" ? "bg-white text-[#04142c]" : "text-white/60")}
                title="Início"
              >
                <Home className="w-6 h-6" />
              </Button>

              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setActiveTab("debtors")}
                className={cn("w-12 h-12 rounded-full transition-all", activeTab === "debtors" ? "bg-white text-[#04142c]" : "text-white/60")}
                title="Devedores"
              >
                <UserIcon className="w-6 h-6" />
              </Button>

              <div className="relative">
                <AnimatePresence>
                  {isSpeedDialOpen && (
                    <>
                      {/* Backdrop for Speed Dial */}
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={cn("fixed inset-0 backdrop-blur-sm z-[60]", theme === 'dark' ? "bg-zinc-950/80" : "bg-[#04142c]/80")}
                        onClick={() => setIsSpeedDialOpen(false)}
                      />
                      
                      {/* Speed Dial Options */}
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed left-1/2 bottom-28 -translate-x-1/2 flex items-end justify-center gap-6 z-[70]"
                      >
                        {/* Extra button */}
                        <div className="flex flex-col items-center gap-2">
                          <button 
                            onClick={() => {
                              setIsSpeedDialOpen(false);
                              setEditingAdditionalSalary(null);
                              setIsAdditionalSalaryModalOpen(true);
                            }}
                            className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-blue-400 hover:scale-110 active:scale-95 transition-all shadow-xl"
                          >
                            <Banknote className="w-6 h-6" />
                          </button>
                          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Extra</span>
                        </div>

                        {/* Despesa (Main Action in Center) */}
                        <div className="flex flex-col items-center gap-2 -translate-y-4">
                          <button 
                            onClick={() => {
                              setIsSpeedDialOpen(false);
                              resetForm();
                              setIsAddModalOpen(true);
                            }}
                            className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-rose-400 hover:scale-110 active:scale-95 transition-all shadow-xl"
                          >
                            <Plus className="w-10 h-10" />
                          </button>
                          <span className="text-xs font-bold text-white uppercase tracking-widest">Despesa</span>
                        </div>

                        {/* Devedor button */}
                        <div className="flex flex-col items-center gap-2">
                          <button 
                            onClick={() => {
                              setIsSpeedDialOpen(false);
                              setEditingDebtor(null);
                              setIsDebtorModalOpen(true);
                            }}
                            className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center text-purple-400 hover:scale-110 active:scale-95 transition-all shadow-xl"
                          >
                            <UserPlus className="w-6 h-6" />
                          </button>
                          <span className="text-[10px] font-bold text-white uppercase tracking-widest">Devedor</span>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>

                <Button 
                  onClick={() => setIsSpeedDialOpen(!isSpeedDialOpen)}
                  className={cn(
                    "w-12 h-12 rounded-full transition-all z-[80] relative",
                    isSpeedDialOpen 
                      ? "bg-rose-500 text-white rotate-45" 
                      : "bg-green-500 text-white shadow-lg hover:bg-green-600"
                  )}
                  title="Menu de adição"
                >
                  <Plus className="w-6 h-6" />
                </Button>
              </div>

              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setActiveTab("report")}
                className={cn("w-12 h-12 rounded-full transition-all", activeTab === "report" ? "bg-white text-[#04142c]" : "text-white/60")}
                title="Relatório"
              >
                <BarChart3 className="w-6 h-6" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setActiveTab("settings")}
                className={cn("w-12 h-12 rounded-full transition-all", activeTab === "settings" ? "bg-white text-[#04142c]" : "text-white/60")}
                title="Configuração"
              >
                <Settings className="w-6 h-6" />
              </Button>
            </div>
          </div>
        )}
    </>
  )}

      {/* Salary Modal */}
      <Dialog open={isSalaryModalOpen} onOpenChange={setIsSalaryModalOpen}>
        <DialogContent 
          className="bg-white/10 backdrop-blur-2xl border-white/10 text-white w-[95vw] sm:max-w-[425px] rounded-3xl"
        >
          <div tabIndex={0} className="sr-only" aria-hidden="true" />
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="w-6 h-6 text-blue-300" />
              Meus Salários
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="modal-salary" className="text-white/70">Salário Principal</Label>
              <div className="relative">
                <Input
                  id="modal-salary"
                  type="text"
                  inputMode="numeric"
                  value={formatCurrencyInput(tempSalary)}
                  onChange={(e) => setTempSalary(parseCurrencyInput(e.target.value))}
                  className="bg-white/10 border-white/10 text-white pl-10 h-12 rounded-xl focus:ring-blue-500"
                  placeholder="0,00"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">R$</span>
              </div>
            </div>

            <div className="grid gap-2 pl-4 border-l-2 border-white/10">
              <Label htmlFor="modal-thirteenth1" className="text-white/70">13º - 1ª parcela</Label>
              <div className="relative">
                <Input
                  id="modal-thirteenth1"
                  type="text"
                  inputMode="numeric"
                  value={formatCurrencyInput(tempThirteenth1)}
                  onChange={(e) => setTempThirteenth1(parseCurrencyInput(e.target.value))}
                  className="bg-white/10 border-white/10 text-white pl-10 h-12 rounded-xl focus:ring-blue-500"
                  placeholder="0,00"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">R$</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="modal-secondarySalary" className="text-white/70">Salário Adicional</Label>
              <div className="relative">
                <Input
                  id="modal-secondarySalary"
                  type="text"
                  inputMode="numeric"
                  value={formatCurrencyInput(tempSecondarySalary)}
                  onChange={(e) => setTempSecondarySalary(parseCurrencyInput(e.target.value))}
                  className="bg-white/10 border-white/10 text-white pl-10 h-12 rounded-xl focus:ring-blue-500"
                  placeholder="0,00"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">R$</span>
              </div>
            </div>

            <div className="grid gap-2 pl-4 border-l-2 border-white/10">
              <Label htmlFor="modal-thirteenth2" className="text-white/70">13º - 2ª parcela</Label>
              <div className="relative">
                <Input
                  id="modal-thirteenth2"
                  type="text"
                  inputMode="numeric"
                  value={formatCurrencyInput(tempThirteenth2)}
                  onChange={(e) => setTempThirteenth2(parseCurrencyInput(e.target.value))}
                  className="bg-white/10 border-white/10 text-white pl-10 h-12 rounded-xl focus:ring-blue-500"
                  placeholder="0,00"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">R$</span>
              </div>
            </div>

            <div className="bg-white/10 p-4 rounded-2xl border border-white/10 flex justify-between items-center">
              <span className="text-sm text-white/70 uppercase font-bold tracking-wider">Total Mensal</span>
              <span className="text-2xl font-bold text-blue-300">
                {(tempSalary + tempSecondarySalary + tempThirteenth1 + tempThirteenth2).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={() => setIsSalaryApplyModalOpen(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white w-full rounded-xl h-12 font-bold shadow-lg"
            >
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSalaryApplyModalOpen} onOpenChange={setIsSalaryApplyModalOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-3xl border-white/10 text-white rounded-[2rem] w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-400" />
              Aplicar Rendimentos
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <p className="text-sm text-white/70 leading-relaxed">
              Como deseja aplicar os novos valores de rendimentos?
            </p>
            
            <div className="grid gap-3">
              {[
                { id: 'all', label: 'Aplicar a todos os meses', desc: 'Replica para todos os meses (passados e futuros)' },
                { id: 'current', label: 'Aplicar apenas ao mês atual', desc: 'Salva somente no mês selecionado' },
                { id: 'future', label: 'Aplicar a partir do mês atual', desc: 'Mês atual e todos os futuros, sem alterar o passado' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => confirmSalarySave(opt.id as any)}
                  className="flex flex-col items-start gap-1 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left group"
                >
                  <span className="text-sm font-bold group-hover:text-blue-300 transition-colors">{opt.label}</span>
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button 
              className="w-full bg-white/5 text-white hover:bg-white/10 font-bold h-12 rounded-xl border border-white/10"
              onClick={() => setIsSalaryApplyModalOpen(false)}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tribute Modal */}
      <Dialog open={isTributeModalOpen} onOpenChange={setIsTributeModalOpen}>
        <DialogContent 
          className={cn("sm:bg-white/10 sm:backdrop-blur-2xl border-white/10 text-white w-full h-[100dvh] sm:h-auto sm:max-w-[425px] sm:rounded-3xl p-0 sm:p-6 flex flex-col m-0 max-w-none", theme === 'dark' ? "bg-zinc-950" : "bg-[#04142c]")}
        >
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            <DialogHeader className="text-left flex-shrink-0">
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                {editingTribute ? "Editar Tributo" : "Novo Tributo"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-6">
              <div className="grid gap-2">
                <Label htmlFor="tribute-name" className="text-white/70">Nome do Tributo</Label>
                <Input
                  id="tribute-name"
                  value={tributeFormData.name}
                  onChange={(e) => setTributeFormData({ ...tributeFormData, name: e.target.value })}
                  className="bg-white/10 border-white/10 text-white h-12 rounded-xl"
                  placeholder="Ex: Dízimo, Passagem"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tribute-percentage" className="text-white/70">Porcentagem (%)</Label>
                <Input
                  id="tribute-percentage"
                  type="number"
                  min="0"
                  max="100"
                  value={tributeFormData.percentage}
                  onChange={(e) => setTributeFormData({ ...tributeFormData, percentage: parseFloat(e.target.value) || 0 })}
                  className="bg-white/10 border-white/10 text-white h-12 rounded-xl"
                  placeholder="Ex: 10"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-white/70">Base de Cálculo</Label>
                <Select 
                  value={tributeFormData.base} 
                  onValueChange={(val: 'main' | 'total') => setTributeFormData({ ...tributeFormData, base: val })}
                >
                  <SelectTrigger className="bg-white/10 border-white/10 text-white h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white">
                    <SelectItem value="total">Renda Total (Salários + Extras)</SelectItem>
                    <SelectItem value="main">Apenas Salário Principal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {validationError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>{validationError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-auto sm:mt-0 pt-6">
              {editingTribute && (
                <Button 
                  variant="destructive" 
                  onClick={() => { handleDeleteTribute(editingTribute.id); setIsTributeModalOpen(false); }}
                  className="h-12 w-12 rounded-xl flex-shrink-0"
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              )}
              <Button 
                onClick={handleSaveTribute}
                disabled={isSaving}
                className="bg-blue-500 hover:bg-blue-600 text-white flex-1 rounded-xl h-12 font-bold max-w-full"
              >
                {isSaving ? "Salvando..." : "Salvar Tributo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isDebtorModalOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseModal(isDebtorModalOpen, setIsDebtorModalOpen, isDebtorFormDirty(), () => setIsDebtorModalOpen(false));
        } else {
          setIsDebtorModalOpen(true);
        }
      }}>
        <DialogContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white w-[95vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingDebtor ? "Editar Devedor" : "Novo Devedor"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="debtor-date" className="text-white/70">Data</Label>
              <div className="relative">
                <Input
                  id="debtor-date"
                  type="date"
                  value={debtorFormData.date}
                  onChange={(e) => setDebtorFormData({ ...debtorFormData, date: e.target.value })}
                  className="bg-white/10 border-white/10 text-white pl-10 h-12 rounded-xl focus:ring-blue-500"
                />
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="debtor-description" className="text-white/70">Nome do Devedor</Label>
              <Input
                id="debtor-description"
                value={debtorFormData.description}
                onChange={(e) => setDebtorFormData({ ...debtorFormData, description: e.target.value })}
                placeholder="Ex: João Silva"
                className="bg-white/10 border-white/10 text-white h-12 rounded-xl focus:ring-blue-500"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="debtor-value" className="text-white/70">Valor</Label>
              <div className="relative">
                <Input
                  id="debtor-value"
                  type="text"
                  inputMode="numeric"
                  value={formatCurrencyInput(debtorFormData.value)}
                  onChange={(e) => setDebtorFormData({ ...debtorFormData, value: parseCurrencyInput(e.target.value) })}
                  placeholder="0,00"
                  className="bg-white/10 border-white/10 text-white pl-10 h-12 rounded-xl focus:ring-blue-500"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">R$</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2 bg-white/10 p-4 rounded-xl border border-white/10">
                <Checkbox 
                  id="debtor-fixed" 
                  checked={!!debtorFormData.isFixed}
                  onCheckedChange={(checked) => setDebtorFormData({ ...debtorFormData, isFixed: !!checked, isRecurring: false })}
                />
                <Label htmlFor="debtor-fixed" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Fixa</Label>
              </div>
              <div className="flex items-center space-x-2 bg-white/10 p-4 rounded-xl border border-white/10">
                <Checkbox 
                  id="debtor-recurring" 
                  checked={!!debtorFormData.isRecurring}
                  onCheckedChange={(checked) => setDebtorFormData({ ...debtorFormData, isRecurring: !!checked, isFixed: false })}
                />
                <Label htmlFor="debtor-recurring" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Parcelada</Label>
              </div>
            </div>

            {debtorFormData.isRecurring && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="debtor-repeatCount" className="text-white/70 text-xs">Parcelas</Label>
                    <Input
                      id="debtor-repeatCount"
                      type="number"
                      min="2"
                      value={debtorFormData.repeatCount}
                      onChange={(e) => setDebtorFormData({ ...debtorFormData, repeatCount: parseInt(e.target.value) || 1 })}
                      className="bg-white/10 border-white/10 text-white h-11 rounded-xl"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="debtor-frequency" className="text-white/70 text-xs">Frequência</Label>
                    <Select 
                      value={debtorFormData.repeatFrequency} 
                      onValueChange={(val: any) => setDebtorFormData({ ...debtorFormData, repeatFrequency: val })}
                    >
                      <SelectTrigger id="debtor-frequency" className="bg-white/10 border-white/10 text-white h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white">
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="yearly">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="text-white/70 text-xs">Tipo de Cálculo</Label>
                  <Select 
                    value={debtorFormData.calculationType} 
                    onValueChange={(val: "total" | "monthly") => setDebtorFormData({ ...debtorFormData, calculationType: val })}
                  >
                    <SelectTrigger className="bg-white/10 border-white/10 text-white h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white">
                      <SelectItem value="total">Dividir valor total (Parcelar)</SelectItem>
                      <SelectItem value="monthly">Valor por parcela (Repetir)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {debtorFormData.repeatCount > 1 && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <div className="flex items-center gap-2 text-blue-300 text-xs">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <p>{getInstallmentMessage(debtorFormData)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="debtor-category" className="text-white/70">Categoria</Label>
              <Select 
                value={debtorFormData.category} 
                onValueChange={(val) => setDebtorFormData({ ...debtorFormData, category: val })}
              >
                <SelectTrigger id="debtor-category" className="bg-white/10 border-white/10 text-white h-11 rounded-xl">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white">
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="debtor-notes" className="text-white/70">Observações (Opcional)</Label>
              <Input
                id="debtor-notes"
                value={debtorFormData.notes}
                onChange={(e) => setDebtorFormData({ ...debtorFormData, notes: e.target.value })}
                placeholder="Ex: Emprestado para o conserto do carro"
                className="bg-white/10 border-white/10 text-white h-12 rounded-xl focus:ring-blue-500"
              />
            </div>

            {validationError && (
              <div className="bg-red-500/20 border border-red-500/50 p-3 rounded-xl flex items-center gap-2 text-red-200 text-sm animate-in shake-1">
                <AlertCircle className="w-4 h-4" />
                {validationError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="ghost" 
              onClick={() => setIsDebtorModalOpen(false)}
              className="text-white hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleAddDebtor}
              disabled={isSaving}
              className="bg-blue-500 hover:bg-blue-600 text-white px-8 rounded-xl h-12 font-bold shadow-lg shadow-blue-500/20"
            >
              {isSaving ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                editingDebtor ? "Salvar Alterações" : "Adicionar Devedor"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Expense Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseModal(isAddModalOpen, setIsAddModalOpen, isExpenseFormDirty(), () => setIsAddModalOpen(false));
        } else {
          setIsAddModalOpen(true);
        }
      }}>
        <DialogContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white w-[95vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto rounded-3xl">
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
                  className="bg-white/10 border-white/10 text-white pl-10"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dueDate" className="text-white/70">Data de Vencimento (Opcional)</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="bg-white/10 border-white/10 text-white pl-10"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="value" className="text-white/70">Valor (R$)</Label>
              <Input
                id="value"
                type="text"
                inputMode="numeric"
                value={formatCurrencyInput(formData.value)}
                onChange={(e) => setFormData({ ...formData, value: parseCurrencyInput(e.target.value) })}
                className="bg-white/10 border-white/10 text-white placeholder:text-white/30"
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description" className="text-white/70">Descrição</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-white/10 border-white/10 text-white placeholder:text-white/30"
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
                <SelectTrigger className="bg-white/10 border-white/10 text-white">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white">
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat} className="focus:bg-white/20 focus:text-white">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-4 bg-white/10 p-4 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="fixed" 
                    checked={!!formData.isFixed}
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
                    checked={!!formData.isRecurring}
                    onCheckedChange={(checked) => setFormData({ ...formData, isRecurring: !!checked })}
                    className="border-white/30 data-[state=checked]:bg-white data-[state=checked]:text-[#144a95]"
                  />
                  <Label htmlFor="recurring" className="text-sm font-medium leading-none">
                    Recorrente
                  </Label>
                </div>
              </div>

              {formData.isRecurring && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-4 pt-2 border-t border-white/10"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="repeatCount" className="text-xs text-white/50">Vezes</Label>
                      <Input
                        id="repeatCount"
                        type="number"
                        min="1"
                        value={formData.repeatCount}
                        onChange={(e) => setFormData({ ...formData, repeatCount: parseInt(e.target.value) || 1 })}
                        className="bg-white/10 border-white/10 text-white h-8"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="frequency" className="text-xs text-white/50">Frequência</Label>
                      <Select 
                        value={formData.repeatFrequency} 
                        onValueChange={(v: "monthly" | "yearly") => setFormData({ ...formData, repeatFrequency: v })}
                      >
                        <SelectTrigger className="bg-white/10 border-white/10 text-white h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white">
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="yearly">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs text-white/50">Tipo de Cálculo</Label>
                    <Select 
                      value={formData.calculationType} 
                      onValueChange={(v: "total" | "monthly") => setFormData({ ...formData, calculationType: v })}
                    >
                      <SelectTrigger className="bg-white/10 border-white/10 text-white h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white">
                        <SelectItem value="total">Dividir valor total (Parcelar)</SelectItem>
                        <SelectItem value="monthly">Valor por parcela (Repetir)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.repeatCount > 1 && (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <div className="flex items-center gap-2 text-blue-300 text-[11px]">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <p>{getInstallmentMessage(formData)}</p>
                      </div>
                    </div>
                  )}
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
              className="w-full bg-white text-[#04142c] hover:bg-white/90 font-bold"
            >
              {isSaving ? "Salvando..." : (editingExpense ? "Efetivar Alteração" : "Efetivar Despesa")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Additional Salary Modal */}
      <Dialog open={isAdditionalSalaryModalOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseModal(isAdditionalSalaryModalOpen, setIsAdditionalSalaryModalOpen, isAdditionalSalaryFormDirty(), () => setIsAdditionalSalaryModalOpen(false));
        } else {
          setIsAdditionalSalaryModalOpen(true);
        }
      }}>
        <DialogContent className="bg-white/10 backdrop-blur-3xl border-white/10 text-white w-[95vw] sm:max-w-[425px] rounded-[2rem] p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-2xl font-bold">
              {editingAdditionalSalary ? "Editar Renda Extra" : "Nova Renda Extra"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-6">
              <div className="grid gap-2">
                <Label htmlFor="add-salary-date" className="text-white/70">Data</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                  <Input
                    id="add-salary-date"
                    type="date"
                    value={additionalSalaryFormData.date}
                    onChange={(e) => setAdditionalSalaryFormData({ ...additionalSalaryFormData, date: e.target.value })}
                    className="bg-white/10 border-white/20 text-white pl-10 h-12 rounded-xl"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-salary-value" className="text-white/70">Valor (R$)</Label>
                <Input
                  id="add-salary-value"
                  type="text"
                  inputMode="numeric"
                  value={formatCurrencyInput(additionalSalaryFormData.value)}
                  onChange={(e) => setAdditionalSalaryFormData({ ...additionalSalaryFormData, value: parseCurrencyInput(e.target.value) })}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 h-12 rounded-xl"
                  placeholder="0,00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-salary-description" className="text-white/70">Descrição</Label>
                <Input
                  id="add-salary-description"
                  value={additionalSalaryFormData.description}
                  onChange={(e) => setAdditionalSalaryFormData({ ...additionalSalaryFormData, description: e.target.value })}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 h-12 rounded-xl"
                  placeholder="Ex: Freelance, Venda..."
                />
              </div>
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
          <DialogFooter className="p-6 pt-2 flex flex-col gap-3 sm:flex-row">
            {editingAdditionalSalary && (
              <Button 
                variant="destructive"
                onClick={() => {
                  handleDeleteAdditionalSalary(editingAdditionalSalary.id);
                  setIsAdditionalSalaryModalOpen(false);
                }}
                className="w-full sm:w-auto bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/50 h-12 rounded-xl order-2 sm:order-1"
              >
                Excluir
              </Button>
            )}
            <Button 
              onClick={handleAddAdditionalSalary}
              disabled={isSaving}
              className="flex-1 bg-white text-[#04142c] hover:bg-white/90 font-bold h-12 rounded-xl order-1 sm:order-2"
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recurring Action Confirmation Modal */}

      {/* Delete Additional Salary Confirmation Modal */}
      <Dialog open={isDeleteAdditionalSalaryConfirmModalOpen} onOpenChange={setIsDeleteAdditionalSalaryConfirmModalOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white w-[95vw] sm:max-w-[400px] rounded-3xl">
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
        <DialogContent className="bg-white/10 backdrop-blur-3xl border-white/10 text-white w-[95vw] sm:max-w-[450px] rounded-[2rem] p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ArrowUpCircle className="w-6 h-6 text-green-400" />
              Rendas Extras - {monthName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="bg-white/5 p-5 rounded-2xl border border-white/10 mb-6 flex justify-between items-center gap-4">
              <span className="text-xs text-white/50 uppercase font-black tracking-widest shrink-0">Total Mensal</span>
              <span className="text-2xl font-bold text-green-400 truncate strike-green-glow">{formatCurrency(totalAdditionalSalary)}</span>
            </div>
            
            <div className="space-y-4 custom-scrollbar">
              {displayAdditionalSalaries.length > 0 ? (
                <div className="space-y-4">
                  <AnimatePresence mode="popLayout">
                    {displayAdditionalSalaries.map(s => (
                      <AdditionalSalaryItem
                        key={s.id}
                        salary={s}
                        onEdit={(salary) => { setIsAdditionalSalaryListModalOpen(false); handleEditAdditionalSalary(salary); }}
                        onDelete={handleDeleteAdditionalSalary}
                        formatCurrency={formatCurrency}
                        formatDate={formatDate}
                        onViewDebtorInfo={(id) => {
                          const debtor = debtors.find(d => d.id === id);
                          if (debtor) {
                            setViewingDebtorInfo(debtor);
                            setIsDebtorInfoModalOpen(true);
                          }
                        }}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-center py-12 text-white/30 italic">
                  Nenhuma renda extra registrada.
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="p-6 pt-2">
            <Button 
              className="w-full bg-white text-[#04142c] hover:bg-white/90 font-bold h-12 rounded-xl border-none"
              onClick={() => {
                setIsAdditionalSalaryListModalOpen(false);
                resetAdditionalSalaryForm();
                setIsAdditionalSalaryModalOpen(true);
              }}
            >
              <Plus className="w-5 h-5 mr-2" />
              Adicionar Nova Renda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteConfirmModalOpen} onOpenChange={setIsDeleteConfirmModalOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white w-[95vw] sm:max-w-[400px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-white/70">
              Tem certeza que deseja excluir {debtorToDelete ? "este devedor" : "esta despesa"}? Esta ação não pode ser desfeita.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="ghost" 
              onClick={() => {
                setIsDeleteConfirmModalOpen(false);
                setDebtorToDelete(null);
                setExpenseToDelete(null);
              }}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={debtorToDelete ? confirmDeleteDebtor : confirmDeleteExpense}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Category Modal */}
      <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white w-[95vw] sm:max-w-[300px] rounded-3xl">
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
              className="w-full bg-white text-[#04142c] hover:bg-white/90"
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing Modal */}
      <Dialog open={isBillingModalOpen} onOpenChange={setIsBillingModalOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white rounded-3xl w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto p-0">
          <div className="p-6">
            <DialogHeader className="mb-6">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Share2 className="w-5 h-5 text-blue-400" />
                Gerar Cobrança
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {!selectedDebtorForBilling ? (
                <div className="space-y-4">
                  <p className="text-sm text-white/70">Selecione um devedor para gerar a mensagem:</p>
                  <div className="space-y-2">
                    {[...fixedDebtors, ...variableDebtors].length === 0 ? (
                      <p className="text-center py-8 text-white/40 italic">Nenhum devedor cadastrado.</p>
                    ) : (
                      [...fixedDebtors, ...variableDebtors].map((debtor) => (
                        <button
                          key={debtor.id}
                          onClick={() => generateBillingMessage(debtor)}
                          className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all text-left"
                        >
                          <div>
                            <div className="font-bold">{debtor.description}</div>
                            <div className="text-xs text-white/50">{formatDate(debtor.date)}</div>
                          </div>
                          <div className="font-bold text-blue-300">{formatCurrency(debtor.value)}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Mensagem Gerada</h4>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSelectedDebtorForBilling(null)}
                        className="h-6 text-[10px] text-blue-400 hover:text-blue-300 px-2"
                      >
                        Alterar Devedor
                      </Button>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 whitespace-pre-wrap text-sm text-white/90 font-medium leading-relaxed">
                      {billingMessage}
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                      <Button 
                        onClick={copyBillingToClipboard}
                        className="w-full bg-white text-[#04142c] hover:bg-white/90 font-bold gap-2 h-12"
                      >
                        {billingCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {billingCopied ? "Copiado" : "Copiar Texto"}
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(billingMessage)}`, '_blank')}
                          variant="outline"
                          className="border-green-500/30 bg-green-500/10 hover:bg-green-500/20 text-green-400 font-bold gap-2 h-12"
                        >
                          <Share2 className="w-4 h-4" />
                          WhatsApp
                        </Button>
                        <Button 
                          onClick={shareBillingMessage}
                          variant="outline"
                          className="border-white/20 bg-white/10 hover:bg-white/20 text-white font-bold gap-2 h-12"
                        >
                          <Share2 className="w-4 h-4" />
                          Outros
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6">
              <Button 
                onClick={() => {
                  setIsBillingModalOpen(false);
                  setTimeout(() => setSelectedDebtorForBilling(null), 300);
                }}
                className="w-full bg-white/10 text-white hover:bg-white/20 font-bold py-6 rounded-2xl border border-white/10"
              >
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Debtor to Extra Confirmation Modal */}
      <Dialog open={isDebtorExtraConfirmModalOpen} onOpenChange={setIsDebtorExtraConfirmModalOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-3xl border-white/10 text-white rounded-[2rem] w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 text-green-400" />
              Lançar Rendimento Extra?
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <p className="text-sm text-white/70 leading-relaxed">
              O devedor <span className="text-white font-bold">{debtorToConfirmExtra?.description}</span> foi recebido com sucesso.
            </p>
            <p className="text-sm text-white/70 leading-relaxed">
              Deseja lançar o valor de <span className="text-green-400 font-bold">{formatCurrency(debtorToConfirmExtra?.value || 0)}</span> como rendimento extra neste mês?
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button 
              variant="ghost" 
              onClick={() => {
                setIsDebtorExtraConfirmModalOpen(false);
                setDebtorToConfirmExtra(null);
              }}
              className="flex-1 text-white/50 hover:text-white hover:bg-white/10 h-12 rounded-xl"
            >
              Agora não
            </Button>
            <Button 
              onClick={handleAddDebtorToExtras}
              className="flex-1 bg-white text-[#04142c] hover:bg-white/90 font-bold h-12 rounded-xl"
              disabled={isSaving}
            >
              {isSaving ? "Lançando..." : "Sim, Lançar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debtor Info Modal */}
      <Dialog open={isDebtorInfoModalOpen} onOpenChange={setIsDebtorInfoModalOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-3xl border-white/10 text-white rounded-[2rem] w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-blue-400" />
              Informações do Devedor
            </DialogTitle>
          </DialogHeader>
          {viewingDebtorInfo && (
            <div className="py-6 space-y-6">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Nome / Descrição</h4>
                    <p className="text-lg font-bold">{viewingDebtorInfo.description}</p>
                  </div>
                  <div className="text-right">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Valor</h4>
                    <p className="text-xl font-bold text-green-300">{formatCurrency(viewingDebtorInfo.value)}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Data</h4>
                    <p className="text-sm font-medium">{formatDate(viewingDebtorInfo.date)}</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Tipo</h4>
                    <p className="text-sm font-medium">{viewingDebtorInfo.isFixed ? "Fixo" : "Variável"}</p>
                  </div>
                </div>

                {viewingDebtorInfo.notes && (
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Observações</h4>
                    <p className="text-sm text-white/70 italic bg-white/5 p-3 rounded-xl border border-white/10">
                      "{viewingDebtorInfo.notes}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button 
              className="w-full bg-white/10 text-white hover:bg-white/20 font-bold h-12 rounded-xl border-white/10"
              onClick={() => {
                setIsDebtorInfoModalOpen(false);
                setViewingDebtorInfo(null);
              }}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Undo Snackbar */}
      <AnimatePresence>
        {isUndoVisible && undoState && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm"
          >
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Ação realizada</p>
                  <p className="text-[10px] text-white/50 uppercase tracking-widest">
                    {undoState.type === 'delete' ? 'Excluído' : 'Editado'} com sucesso
                  </p>
                </div>
              </div>
              <Button 
                onClick={handleUndo}
                variant="ghost"
                className="bg-white text-[#04142c] hover:bg-white/90 h-10 px-4 rounded-xl font-bold flex items-center gap-2"
              >
                Desfazer
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Action Confirmation Modal */}
      <Dialog open={isBulkConfirmOpen} onOpenChange={setIsBulkConfirmOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-3xl border-white/10 text-white rounded-[2rem] w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              Confirmar Alteração
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <p className="text-sm text-white/70 leading-relaxed">
              Este é um registro recorrente ou fixo. Como deseja aplicar a {bulkActionTarget?.type === 'edit' ? 'edição' : 'exclusão'}?
            </p>
            
            <div className="grid gap-3">
              {[
                { id: 'single', label: 'Apenas este registro (atual)', desc: 'Afeta somente o registro selecionado' },
                { id: 'pending', label: 'Todas as pendentes', desc: 'Afeta todas que NÃO foram marcadas como finalizadas' },
                { id: 'effective', label: 'Todas as efetivadas', desc: 'Afeta todas já marcadas como finalizadas' },
                { id: 'current_plus_pending', label: 'Este e todos pendentes', desc: 'Registro atual e todas as futuras pendentes' },
                { id: 'current_plus_effective', label: 'Este e todos efetivos', desc: 'Registro atual e todos os já finalizados' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleBulkAction(opt.id as BulkActionType)}
                  className="flex flex-col items-start p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all text-left group"
                >
                  <span className="text-sm font-bold group-hover:text-blue-300 transition-colors">{opt.label}</span>
                  <span className="text-[10px] text-white/40">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="ghost" 
              onClick={() => setIsBulkConfirmOpen(false)}
              className="w-full text-white/50 hover:text-white hover:bg-white/10 h-12 rounded-xl"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Discard Changes Confirmation */}
      <Dialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <DialogContent className={cn("backdrop-blur-2xl border-white/10 text-white rounded-[2rem] w-[90vw] sm:max-w-sm", theme === 'dark' ? "bg-zinc-950/90" : "bg-[#04142c]/90")}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-yellow-400" />
              Descartar alterações?
            </DialogTitle>
            <DialogDescription className="text-white/60 text-sm">
              Você tem alterações não salvas. Se sair agora, elas serão perdidas permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row mt-4">
            <Button 
              variant="ghost" 
              onClick={() => setShowDiscardConfirm(false)}
              className="w-full text-white/50 hover:text-white hover:bg-white/10 h-12 rounded-xl border border-white/5"
            >
              Continuar Editando
            </Button>
            <Button 
              onClick={() => {
                setShowDiscardConfirm(false);
                if (pendingCloseAction) {
                  pendingCloseAction();
                  setPendingCloseAction(null);
                }
              }}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold h-12 rounded-xl"
            >
              Descartar e Sair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white rounded-3xl w-[95vw] sm:max-w-md p-0">
          <div className="p-6">
            <DialogHeader className="mb-6">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Share2 className="w-5 h-5 text-blue-400" />
                Compartilhar App
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-4">
                <p className="text-sm text-white/70 leading-relaxed">
                  Compartilhe o link abaixo para que outras pessoas possam utilizar o Orin de forma independente com login Google.
                </p>
                <div className="flex flex-col gap-2 bg-white/5 p-3 rounded-xl border border-white/10">
                  <code className="text-xs font-mono text-blue-300 break-all py-1">
                    https://orin-lcl.vercel.app
                  </code>
                  <Button 
                    size="sm" 
                    onClick={copyToClipboard}
                    className="w-full h-10 bg-white/10 hover:bg-white/20 text-white gap-2 font-bold"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copiado" : "Copiar Link"}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Como funciona?</h4>
                <ul className="space-y-2 text-sm text-white/60">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <span>Cada usuário tem seu próprio espaço seguro.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <span>Acesso via conta Google para máxima segurança.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <span>Dados salvos automaticamente na nuvem.</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-6">
              <Button 
                onClick={() => setIsShareModalOpen(false)}
                className="w-full bg-white text-[#04142c] hover:bg-white/90 font-bold py-6 rounded-2xl"
              >
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Panel */}
      {isAdmin && (
        <>
          <button 
            onClick={() => setIsAdminPanelOpen(true)}
            className="fixed bottom-6 right-6 bg-gradient-to-tr from-blue-600 to-blue-400 p-4 rounded-full shadow-2xl z-50 hover:scale-110 transition-transform flex items-center justify-center border border-white/20"
            title="Painel Administrativo"
          >
            <ShieldCheck className="w-6 h-6 text-white" />
          </button>

          <Dialog open={isAdminPanelOpen} onOpenChange={setIsAdminPanelOpen}>
            <DialogContent className={cn("backdrop-blur-3xl border-white/10 text-white rounded-[2rem] w-[95vw] sm:max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden", theme === 'dark' ? "bg-zinc-950/95" : "bg-[#04142c]/95")}>
              <div className="p-6 border-b border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 text-blue-400" />
                    Gerenciamento Geral
                  </DialogTitle>
                </DialogHeader>
                
                <div className="flex gap-2 mt-6 bg-white/5 p-1 rounded-2xl border border-white/5 overflow-x-auto custom-scrollbar">
                  <button
                    onClick={() => setAdminTab('users')}
                    className={cn(
                      "flex-1 min-w-[100px] py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all",
                      adminTab === 'users' ? "bg-white text-[#04142c] shadow-lg" : "text-white/40 hover:text-white/60"
                    )}
                  >
                    Usuários
                  </button>
                  <button
                    onClick={() => setAdminTab('feedbacks')}
                    className={cn(
                      "flex-1 min-w-[100px] py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all",
                      adminTab === 'feedbacks' ? "bg-white text-[#04142c] shadow-lg" : "text-white/40 hover:text-white/60"
                    )}
                  >
                    Feedbacks ({feedbacks.length})
                  </button>
                  <button
                    onClick={() => setAdminTab('updates')}
                    className={cn(
                      "flex-1 min-w-[100px] py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all",
                      adminTab === 'updates' ? "bg-white text-[#04142c] shadow-lg" : "text-white/40 hover:text-white/60"
                    )}
                  >
                    Atualização
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {adminTab === 'users' ? (
                  allAppUsers.length === 0 ? (
                    <div className="text-center py-12 text-white/30 italic">Nenhum usuário encontrado.</div>
                  ) : (
                    <div className="space-y-3">
                      {allAppUsers.map(userItem => (
                        <div key={userItem.id} className="bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="font-bold flex items-center justify-between sm:justify-start gap-2">
                              {userItem.name}
                              <span className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold border",
                                userItem.status === 'active' ? "bg-green-500/10 border-green-500/20 text-green-400" :
                                userItem.status === 'pending' ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" :
                                "bg-red-500/10 border-red-500/20 text-red-400"
                              )}>
                                {userItem.status === 'active' ? 'Ativo' : userItem.status === 'pending' ? 'Pendente' : 'Recusado'}
                              </span>
                            </div>
                            <div className="text-sm text-white/60">{userItem.email}</div>
                          </div>
                          
                          <div className="flex gap-2 w-full sm:w-auto">
                            {userItem.status !== 'active' && (
                              <Button 
                                size="sm"
                                onClick={() => handleUpdateAppUserStatus(userItem.id, 'active')}
                                className="flex-1 sm:flex-none bg-green-500/20 hover:bg-green-500/30 text-green-400 font-bold border border-green-500/30"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Aprovar
                              </Button>
                            )}
                            {userItem.status !== 'rejected' && (
                              <Button 
                                size="sm"
                                onClick={() => handleUpdateAppUserStatus(userItem.id, 'rejected')}
                                className="flex-1 sm:flex-none bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold border border-red-500/30"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Recusar
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : adminTab === 'feedbacks' ? (
                  <div className="space-y-6">
                    <Card className="liquid-glass text-white overflow-hidden relative p-4 rounded-2xl flex flex-col justify-between">
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <ShieldCheck className="w-8 h-8" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-white/70 uppercase mb-1 tracking-widest">Status Geral</div>
                        <div className="flex items-baseline gap-1 mb-2">
                          <div className="text-xl sm:text-2xl font-bold text-blue-300">
                            {feedbackStats.approvalRate > 0 ? `${Math.round(feedbackStats.approvalRate)}%` : '---'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-1.5 border-t border-white/5 pt-3">
                        <div className="flex justify-between items-center text-[8px] uppercase font-bold tracking-widest text-white/30">
                          <span>Taxa de Aprovação</span>
                          <span className="text-yellow-400 font-bold flex items-center gap-0.5">
                            <Star className="w-2 h-2 fill-yellow-400" />
                            {feedbackStats.average.toFixed(1)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ 
                              width: `${feedbackStats.approvalRate}%`,
                              backgroundColor: "rgba(250, 204, 21, 0.6)"
                            }}
                            className="h-full rounded-full shadow-[0_0_8px_rgba(250,204,21,0.2)]"
                          />
                        </div>
                        <div className="text-[8px] text-white/40 font-bold uppercase tracking-tighter mt-1">
                          Baseado em {feedbackStats.count} feedbacks
                        </div>
                      </div>
                    </Card>

                    {feedbacks.length === 0 ? (
                      <div className="text-center py-12 text-white/30 italic">Nenhum feedback recebido ainda.</div>
                    ) : (
                      <div className="space-y-4">
                        {feedbacks
                          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                          .map(fb => (
                          <div key={fb.id} className="bg-white/5 p-5 rounded-3xl border border-white/10 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-white">{fb.userName}</div>
                              <div className="text-[10px] text-white/40">{fb.userEmail}</div>
                            </div>
                            <div className="flex bg-yellow-400/10 px-2 py-1 rounded-lg">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star 
                                  key={star}
                                  className={cn(
                                    "w-3 h-3",
                                    fb.stars >= star ? "text-yellow-400 fill-yellow-400" : "text-white/10"
                                  )} 
                                />
                              ))}
                            </div>
                          </div>
                          
                          <div className="text-sm text-white/80 leading-relaxed bg-white/5 p-4 rounded-2xl italic border border-white/5">
                            "{fb.message}"
                          </div>
                          
                          <div className="flex justify-between items-center text-[10px] text-white/30 uppercase tracking-widest font-bold">
                            <span>ID: {fb.userId.slice(0, 8)}...</span>
                            <span>{new Date(fb.updatedAt).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl">
                      <div className="flex items-center gap-2 text-blue-400 mb-2 font-bold">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        Atenção
                      </div>
                      <p className="text-sm text-white/70">
                        Os dados aqui preenchidos serão exibidos no balão de atualização do sistema <strong>somente após um novo deploy no Vercel (versão real disponível)</strong>. Não force os usuários a atualizar para versões quebradas.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label>Título Menor / Tagline</Label>
                        <Input 
                          placeholder="Ex: Nova Funcionalidade!" 
                          className="bg-white/5 border-white/10 text-white h-12"
                          value={updateForm.title}
                          onChange={(e) => setUpdateForm({ ...updateForm, title: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Versão</Label>
                        <Input 
                          placeholder="Ex: 2.1.0" 
                          className="bg-white/5 border-white/10 text-white h-12"
                          value={updateForm.version}
                          onChange={(e) => setUpdateForm({ ...updateForm, version: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Changelog (O que mudou)</Label>
                        <Textarea 
                          placeholder="Melhorias de estabilidade..." 
                          className="bg-white/5 border-white/10 text-white min-h-[120px]"
                          value={updateForm.changelog}
                          onChange={(e) => setUpdateForm({ ...updateForm, changelog: e.target.value })}
                        />
                      </div>
                      <div className="flex items-center gap-3 bg-white/5 p-4 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors">
                        <Checkbox 
                          id="isMandatory" 
                          className="border-white/30 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500" 
                          checked={updateForm.isMandatory}
                          onCheckedChange={(c) => setUpdateForm({ ...updateForm, isMandatory: !!c })}
                        />
                        <div className="grid gap-1.5 leading-none cursor-pointer flex-1" onClick={() => setUpdateForm(p => ({ ...p, isMandatory: !p.isMandatory }))}>
                          <label htmlFor="isMandatory" className="text-sm font-bold leading-none cursor-pointer text-white">
                            Atualização Obrigatória (Bloqueante)
                          </label>
                          <p className="text-[10px] text-white/50">
                            Se marcado, os usuários não poderão fechar o balão sem clicar em "Atualizar".
                          </p>
                        </div>
                      </div>

                      <Button 
                        className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-lg mt-4" 
                        onClick={handleSaveAppUpdate}
                        disabled={isSavingUpdate}
                      >
                        {isSavingUpdate ? <RefreshCw className="w-5 h-5 animate-spin" /> : "Salvar Configuração e Preparar"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-6 border-t border-white/10">
                <Button 
                  onClick={() => setIsAdminPanelOpen(false)}
                  className="w-full bg-white text-[#04142c] hover:bg-white/90 font-bold py-6 rounded-2xl text-lg"
                >
                  Fechar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

    </div>
  </div>
  </>
  );
}
