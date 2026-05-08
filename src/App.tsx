import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Edit2, Wallet, ArrowUpCircle, ArrowDownCircle, ChevronLeft, ChevronRight, ChevronDown, Calendar as CalendarIcon, BarChart3, Home, PieChart, TrendingUp, LogOut, LogIn, AlertCircle, GripVertical, Share2, Copy, Check, Download, Camera, Target, User as UserIcon, UserPlus, Banknote, X } from "lucide-react";
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
import { formatCurrencyParts, generateId, addMonths, addYears, formatDateToISO } from "./utils";
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
            {debtor.isReceived && <Badge className="bg-green-500 text-[10px] h-4 px-1 text-white">Recebido</Badge>}
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60">
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
            {expense.isPaid && <Badge className="bg-green-500 text-[10px] h-4 px-1 text-white">Pago</Badge>}
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [isSavingSalary, setIsSavingSalary] = useState(false);
  const [salaryTimeout, setSalaryTimeout] = useState<NodeJS.Timeout | null>(null);

  const [salary, setSalary] = useState<number>(0);
  const [secondarySalary, setSecondarySalary] = useState<number>(0);
  const [isTitheEnabled, setIsTitheEnabled] = useState(false);
  const [tithePaidMonths, setTithePaidMonths] = useState<string[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [additionalSalaries, setAdditionalSalaries] = useState<AdditionalSalary[]>([]);
  const [displayExpenses, setDisplayExpenses] = useState<Expense[]>([]);
  const [displayAdditionalSalaries, setDisplayAdditionalSalaries] = useState<AdditionalSalary[]>([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"home" | "report" | "debtors">("home");
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

  const [systemConfig, setSystemConfig] = useState<{ appIconUrl?: string }>({});
  const isAdmin = user?.email === "loukianoslimes@gmail.com";

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
      setIsTitheEnabled(false);
      setTithePaidMonths([]);
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

    // Listen to Settings (Salary & Dashboard Order)
    const settingsPath = `users/${user.uid}/settings/main`;
    const settingsUnsubscribe = onSnapshot(doc(db, settingsPath), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const cloudSalary = data.salary || 0;
        const cloudSecondarySalary = data.secondarySalary || 0;
        const cloudIsTitheEnabled = data.isTitheEnabled || false;
        const cloudTithePaidMonths = data.tithePaidMonths || [];
        
        if (data.photoURL) {
          setUserPhotoUrl(data.photoURL);
        } else if (user.photoURL) {
          setUserPhotoUrl(user.photoURL);
        }

        setIsTitheEnabled(cloudIsTitheEnabled);
        setTithePaidMonths(cloudTithePaidMonths);

        setSalary(prev => {
          if (prev !== cloudSalary && !isSavingSalary) {
            return cloudSalary;
          }
          return prev;
        });

        setSecondarySalary(prev => {
          if (prev !== cloudSecondarySalary && !isSavingSalary) {
            return cloudSecondarySalary;
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

    return () => {
      settingsUnsubscribe();
      expensesUnsubscribe();
      additionalUnsubscribe();
      debtorsUnsubscribe();
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
  const updateSalaryInCloud = async (newSalary: number, isSecondary: boolean = false) => {
    if (!user) return;
    setIsSavingSalary(true);
    const path = `users/${user.uid}/settings/main`;
    try {
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };
      if (isSecondary) {
        updateData.secondarySalary = newSalary;
      } else {
        updateData.salary = newSalary;
      }
      
      await setDoc(doc(db, path), updateData, { merge: true });
      setIsSavingSalary(false);
    } catch (error) {
      setIsSavingSalary(false);
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleSalaryChange = (val: number, isSecondary: boolean = false) => {
    if (isSecondary) {
      setSecondarySalary(val);
    } else {
      setSalary(val);
    }
    
    if (salaryTimeout) {
      clearTimeout(salaryTimeout);
    }

    const timeout = setTimeout(() => {
      updateSalaryInCloud(val, isSecondary);
    }, 1000);
    
    setSalaryTimeout(timeout);
  };

  const handleToggleTithe = async () => {
    if (!user) return;
    const path = `users/${user.uid}/settings/main`;
    try {
      await setDoc(doc(db, path), { isTitheEnabled: !isTitheEnabled }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleToggleTithePaid = async () => {
    if (!user) return;
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    const path = `users/${user.uid}/settings/main`;
    try {
      const newPaidMonths = isTithePaid
        ? tithePaidMonths.filter(m => m !== currentMonthStr)
        : [...tithePaidMonths, currentMonthStr];
      await setDoc(doc(db, path), { tithePaidMonths: newPaidMonths }, { merge: true });
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

  const savePixKey = (key: string) => {
    setPixKey(key);
    localStorage.setItem('user-pix-key', key);
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
    
    const formattedDate = formatDate(debtor.date);
    
    let message = `Olá!
Estou passando para lembrar sobre o valor de ${formattedValue} referente a ${debtor.description}, com vencimento em ${formattedDate}.`;

    if (pixKey) {
      message += `\n\nO valor pode ser depositado no PIX: ${pixKey}`;
    }

    message += `\n\nFico no aguardo do pagamento. Obrigado!`;
    
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
    setIsSaving(true);
    
    const expenseData = {
      ...formData,
      uid: user.uid,
    };

    const basePath = `users/${user.uid}/expenses`;
    const maxOrder = Math.max(...filteredExpenses.map(e => e.order || 0), -1);
    const nextOrder = maxOrder + 1;

    try {
      if (editingExpense) {
        if (editingExpense.isFixed || editingExpense.parentId || editingExpense.isRecurring) {
          setRecurringActionType("edit");
          setIsAddModalOpen(false);
          setIsRecurringActionModalOpen(true);
          setIsSaving(false);
          return;
        } else {
          const path = `${basePath}/${editingExpense.id}`;
          await setDoc(doc(db, path), sanitizeData({
            ...expenseData,
            order: editingExpense.order ?? nextOrder
          }));
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
            batch.set(doc(db, path), sanitizeData({
              ...expenseData,
              date: formatDateToISO(nextDate),
              dueDate: nextDueDateStr || expenseData.dueDate,
              parentId: parentId,
              installmentIndex: i + 1,
              order: nextOrder,
            }));
          }
          await batch.commit();
        } else {
          const id = generateId();
          const path = `${basePath}/${id}`;
          await setDoc(doc(db, path), sanitizeData({
            ...expenseData,
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
    dueDate: string;
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

  const totalIncome = salary + secondarySalary + totalAdditionalSalary;

  const { totalMonthlyExpenses, totalPaidExpenses, totalRemainingExpenses, titheValue, isTithePaid } = useMemo(() => {
    const currentMonthStr = currentDate.toISOString().slice(0, 7);
    const titheVal = totalIncome * 0.1;
    const tithePaid = tithePaidMonths.includes(currentMonthStr);

    const titheToInclude = isTitheEnabled ? titheVal : 0;
    
    // Calculate unpaid debtors to include in "A Pagar" as requested
    const unpaidDebtorsValue = debtors.filter(d => {
      // For fixed debtors, check if current month is not in receivedMonths
      if (d.isFixed) {
        return !(d.receivedMonths || []).includes(currentMonthStr);
      }
      // For variable debtors, check isReceived and date
      return !d.isReceived && d.date.slice(0, 7) === currentMonthStr;
    }).reduce((acc, curr) => acc + curr.value, 0);

    const total = filteredExpenses.reduce((acc, curr) => acc + curr.value, 0) + titheToInclude + unpaidDebtorsValue;
    const paid = filteredExpenses.filter(e => e.isPaid).reduce((acc, curr) => acc + curr.value, 0) + (isTitheEnabled && tithePaid ? titheVal : 0);
    const remaining = total - paid;
    return { 
      totalMonthlyExpenses: total, 
      totalPaidExpenses: paid, 
      totalRemainingExpenses: remaining,
      titheValue: titheVal,
      isTithePaid: tithePaid
    };
  }, [filteredExpenses, isTitheEnabled, totalIncome, tithePaidMonths, currentDate, debtors]);

  const balance = totalIncome - (totalMonthlyExpenses - (isTitheEnabled && !isTithePaid ? titheValue : 0));

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

    const prevTotalIncome = salary + secondarySalary + prevAdditionalSalary;
    
    // Include tithe in previous month expenses if enabled
    const prevTitheValue = isTitheEnabled ? prevTotalIncome * 0.1 : 0;
    const prevTotalExpensesWithTithe = prevTotalExpenses + prevTitheValue;
    
    const prevBalance = prevTotalIncome - prevTotalExpensesWithTithe;

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
        const path = `${basePath}/${editingDebtor.id}`;
        await setDoc(doc(db, path), sanitizeData(debtorData));
      } else {
        if (debtorFormData.isRecurring && debtorFormData.repeatCount > 1) {
          const parentId = generateId();
          const [y, m, d] = debtorFormData.date.split('-').map(Number);
          const baseDate = new Date(y, m - 1, d);

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
    });
    setIsDebtorModalOpen(true);
  };

  const handleDeleteDebtor = (id: string) => {
    setDebtorToDelete(id);
    setIsDeleteConfirmModalOpen(true);
  };

  const confirmDeleteDebtor = async () => {
    if (debtorToDelete && user) {
      const path = `users/${user.uid}/debtors/${debtorToDelete}`;
      try {
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
      description: debtorToConfirmExtra.description,
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
      
      // Update debtor to mark it as added to extras
      // For fixed debtors, we might need a more complex way to track which months were added,
      // but for now let's use a simple flag or assume it's one-off per month.
      // If we want to be strict, we could have addedToExtrasMonths: string[]
      if (debtorToConfirmExtra.isFixed) {
        const docSnap = await getDoc(doc(db, debtorPath));
        if (docSnap.exists()) {
          const currentAddedMonths = docSnap.data().addedToExtraMonths || [];
          batch.update(doc(db, debtorPath), { 
            addedToExtraMonths: [...currentAddedMonths, currentMonthStr] 
          });
        }
      } else {
        batch.update(doc(db, debtorPath), { addedToExtras: true });
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
    // Ensure recurring modal is closed before opening edit modal
    setIsRecurringActionModalOpen(false);
    setRecurringActionType(null);
    
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
      date: toISODate(expense.date),
      dueDate: expense.dueDate ? toISODate(expense.dueDate) : "",
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
      dueDate: "",
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

      const monthTotalIncome = salary + secondarySalary + mAdditional;
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
    <div className="min-h-screen bg-gradient-to-br from-[#010409] to-[#04142c] text-white p-4 md:p-8 font-sans overflow-x-hidden">
      {/* Zoom Controls */}
      <div className="fixed bottom-24 right-6 flex flex-col gap-2 z-30">
        <Button
          size="icon"
          className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 text-white shadow-2xl hover:bg-white/20"
          onClick={() => setZoomLevel(prev => Math.min(prev + 0.1, 1.5))}
        >
          <Plus className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 text-white shadow-2xl hover:bg-white/20"
          onClick={() => setZoomLevel(prev => Math.max(prev - 0.1, 0.7))}
        >
          <div className="w-4 h-0.5 bg-current" />
        </Button>
      </div>

      <div 
        className="max-w-3xl mx-auto w-full space-y-6 pb-24 pt-24"
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
                          onClick={() => setIsSalaryModalOpen(true)}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-white/40 group-hover:text-white/70 transition-colors">Salários:</span>
                            {isSavingSalary && (
                              <div className="w-2.5 h-2.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            )}
                          </div>
                          <span className="text-white/60 font-bold group-hover:text-white transition-colors">{formatCurrency(salary + secondarySalary)}</span>
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
                        "liquid-glass text-white overflow-hidden relative p-4 rounded-2xl h-full flex flex-col justify-between transition-all duration-300 cursor-pointer",
                        !isTitheEnabled && "opacity-60"
                      )}
                      onClick={() => isTitheEnabled && handleToggleTithePaid()}
                    >
                      <div className="flex justify-between items-start mb-2 relative z-10">
                        <div className="flex flex-col">
                          <div className="text-[10px] font-bold text-white/70 uppercase tracking-widest flex items-center gap-2">
                            Dízimo
                            {!isTitheEnabled && <span className="text-[8px] text-white/30 uppercase font-bold">Off</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleToggleTithe(); }}
                            className={cn(
                              "w-8 h-4 sm:w-10 sm:h-5 rounded-full relative transition-colors duration-200",
                              isTitheEnabled ? "bg-blue-500" : "bg-white/10"
                            )}
                          >
                            <motion.div 
                              animate={{ x: isTitheEnabled ? (typeof window !== 'undefined' && window.innerWidth < 640 ? 16 : 20) : 2 }}
                              className="w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-full absolute top-0.5"
                            />
                          </button>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-baseline gap-1 overflow-hidden">
                          <span className="text-[10px] opacity-50 font-bold">R$</span>
                          <div className={cn(
                            "text-lg sm:text-xl font-bold truncate",
                            isTitheEnabled ? (isTithePaid ? "text-green-300" : "text-red-300") : "text-white/40"
                          )}>
                            {titheValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                        {isTitheEnabled && (
                          <div className="mt-2 text-[9px] uppercase font-bold tracking-tighter opacity-40">
                            {isTithePaid ? "✓ Pago" : "○ Pendente"}
                          </div>
                        )}
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
                <button 
                  className="w-full p-6 border-b border-white/10 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors text-left"
                  onClick={() => setIsFixedExpensesExpanded(!isFixedExpensesExpanded)}
                  aria-expanded={isFixedExpensesExpanded}
                >
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">Despesas Fixas</h2>
                    <motion.div
                      animate={{ rotate: isFixedExpensesExpanded ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronDown className="w-5 h-5 text-white/50" />
                    </motion.div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-bold text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
                      {formatCurrency(fixedExpenses.reduce((sum, exp) => sum + exp.value, 0))}
                    </div>
                    <Badge variant="outline" className="text-white border-white/30">
                      {fixedExpenses.length} itens
                    </Badge>
                  </div>
                </button>
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
              <button 
                className="w-full p-6 border-b border-white/10 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors text-left"
                onClick={() => setIsVariableExpensesExpanded(!isVariableExpensesExpanded)}
                aria-expanded={isVariableExpensesExpanded}
              >
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold">Despesas</h2>
                  <motion.div
                    animate={{ rotate: isVariableExpensesExpanded ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ChevronDown className="w-5 h-5 text-white/50" />
                  </motion.div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-bold text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
                    {formatCurrency(variableExpenses.reduce((sum, exp) => sum + exp.value, 0))}
                  </div>
                  <Badge variant="outline" className="text-white border-white/30">
                    {variableExpenses.length} itens
                  </Badge>
                </div>
              </button>
              
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
                            // Group expenses by date (YYYY-MM-DD)
                            const grouped: Record<string, Expense[]> = {};
                            variableExpenses.forEach(e => {
                              const dateKey = e.date.split('T')[0];
                              if (!grouped[dateKey]) grouped[dateKey] = [];
                              grouped[dateKey].push(e);
                            });

                            // Sort dates descending (newest first) or ascending?
                            // Usually, daily logs are newest first or chronologically.
                            // The filtered list is already sorted by date ascending (at line 1250).
                            // Let's keep chronological for the month view.
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
                                    {grouped[dateStr].map(expense => {
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
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  {isEditingPix ? (
                    <div className="flex gap-2 animate-in fade-in zoom-in-95 duration-200">
                      <Input 
                        value={pixKey}
                        onChange={(e) => setPixKey(e.target.value)}
                        placeholder="CPF, E-mail, etc"
                        className="h-8 bg-white/10 border-white/20 text-xs text-white"
                        autoFocus
                      />
                      <Button 
                        size="sm" 
                        onClick={() => { savePixKey(pixKey); setIsEditingPix(false); }}
                        className="h-8 bg-blue-500 hover:bg-blue-600 text-white px-2"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-mono font-bold truncate text-blue-100 flex-1">
                        {pixKey || <span className="text-white/30 font-sans italic font-normal">Não cadastrada</span>}
                      </div>
                      {pixKey && (
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={copyPixToClipboard}
                            className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
                            title="Copiar PIX"
                          >
                            {pixCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
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
        ) : (
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
                      tickFormatter={(value) => `R$ ${value}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#04142c', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px' }}
                      itemStyle={{ fontSize: '12px' }}
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
              className="liquid-glass p-6 rounded-3xl cursor-pointer transition-all hover:bg-white/5 group"
              onClick={() => setIsEfficiencyExpanded(!isEfficiencyExpanded)}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-400" />
                  <h2 className="text-lg font-bold">Eficiência Financeira</h2>
                </div>
                <motion.div
                  animate={{ rotate: isEfficiencyExpanded ? 180 : 0 }}
                  className="text-white/40 group-hover:text-white/70"
                >
                  <ChevronDown className="w-5 h-5" />
                </motion.div>
              </div>

              <div className="space-y-6">
                {!isEfficiencyExpanded ? (
                  /* Summary View: Current vs Previous */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(() => {
                      const latest = reportData.monthlyData[reportData.monthlyData.length - 1];
                      const previous = reportData.monthlyData[reportData.monthlyData.length - 2];
                      
                      return (
                        <>
                          {latest && (
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/40">
                                <span>{latest.name} (Atual)</span>
                                <span>{latest.efficiency}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${latest.efficiency}%` }}
                                  className={cn(
                                    "h-full rounded-full transition-all duration-1000",
                                    latest.efficiency > 50 ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" : 
                                    latest.efficiency > 20 ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]" : 
                                    "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                                  )}
                                />
                              </div>
                            </div>
                          )}
                          {previous && (
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/40">
                                <span>{previous.name} (Anterior)</span>
                                <span>{previous.efficiency}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${previous.efficiency}%` }}
                                  className={cn(
                                    "h-full rounded-full opacity-60 transition-all duration-1000",
                                    previous.efficiency > 50 ? "bg-green-500" : 
                                    previous.efficiency > 20 ? "bg-blue-500" : 
                                    "bg-red-500"
                                  )}
                                />
                              </div>
                            </div>
                          )}
                          {latest && previous && (
                            <div className="col-span-1 sm:col-span-2 pt-2 border-t border-white/5">
                              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                                <span className="text-white/40">Variação:</span>
                                <span className={cn(
                                  latest.efficiency >= previous.efficiency ? "text-green-400" : "text-red-400",
                                  "flex items-center gap-1"
                                )}>
                                  {latest.efficiency >= previous.efficiency ? <TrendingUp className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                                  {Math.abs(latest.efficiency - previous.efficiency)}%
                                  <span className="text-[10px] opacity-60 ml-0.5">
                                    {latest.efficiency >= previous.efficiency ? "Melhoria" : "Queda"}
                                  </span>
                                </span>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  /* Detailed View: Last 6 months */
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-6"
                  >
                    {[...reportData.monthlyData].reverse().slice(0, 6).map((month, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                          <span className="text-white/60">{month.name} {idx === 0 && <span className="text-[8px] px-1.5 py-0.5 bg-white/10 rounded-full ml-1 text-white/50">Atual</span>}</span>
                          <span className={cn(
                            month.efficiency > 50 ? "text-green-400" : month.efficiency > 20 ? "text-yellow-400" : "text-red-400"
                          )}>
                            {month.efficiency}% de economia
                          </span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${month.efficiency}%` }}
                            className={cn(
                              "h-full rounded-full transition-all duration-1000",
                              month.efficiency > 50 ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" : 
                              month.efficiency > 20 ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]" : 
                              "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                            )}
                          />
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>
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
        )}

        {/* Version Indicator & Cache Control */}
        {user && (
          <div className="flex flex-col items-center justify-center gap-2 mt-8 mb-32">
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
                    for (let registration of registrations) {
                      registration.unregister();
                    }
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
              Limpar Cache e Atualizar
            </Button>
          </div>
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
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-full p-2 flex items-center gap-2 shadow-2xl">
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

              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setActiveTab("report")}
                className={cn("w-12 h-12 rounded-full transition-all", activeTab === "report" ? "bg-white text-[#04142c]" : "text-white/60")}
                title="Relatório"
              >
                <BarChart3 className="w-6 h-6" />
              </Button>
              
              <div className="w-px h-6 bg-white/20 mx-1" />
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsShareModalOpen(true)}
                className="w-12 h-12 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all"
                title="Compartilhar"
              >
                <Share2 className="w-6 h-6" />
              </Button>

              <Button 
                variant="ghost" 
                size="icon" 
                onClick={logout}
                className="w-12 h-12 rounded-full text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="Sair"
              >
                <LogOut className="w-6 h-6" />
              </Button>

              <div className="w-px h-6 bg-white/20 mx-1" />

              <div className="relative">
                <AnimatePresence>
                  {isSpeedDialOpen && (
                    <>
                      {/* Backdrop for Speed Dial */}
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-[#04142c]/80 backdrop-blur-sm z-[60]"
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
                  type="number"
                  value={salary || ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    handleSalaryChange(val, false);
                  }}
                  className="bg-white/10 border-white/10 text-white pl-10 h-12 rounded-xl focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                  type="number"
                  value={secondarySalary || ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    handleSalaryChange(val, true);
                  }}
                  className="bg-white/10 border-white/10 text-white pl-10 h-12 rounded-xl focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0,00"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">R$</span>
              </div>
            </div>

            <div className="bg-white/10 p-4 rounded-2xl border border-white/10 flex justify-between items-center">
              <span className="text-sm text-white/70 uppercase font-bold tracking-wider">Total Mensal</span>
              <span className="text-2xl font-bold text-blue-300">
                {(salary + secondarySalary).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={() => setIsSalaryModalOpen(false)}
              className="bg-blue-500 hover:bg-blue-600 text-white w-full rounded-xl h-12 font-bold shadow-lg"
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Debtor Modal */}
      <Dialog open={isDebtorModalOpen} onOpenChange={setIsDebtorModalOpen}>
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
                  type="number"
                  value={debtorFormData.value || ""}
                  onChange={(e) => setDebtorFormData({ ...debtorFormData, value: parseFloat(e.target.value) || 0 })}
                  placeholder="0,00"
                  className="bg-white/10 border-white/10 text-white pl-10 h-12 rounded-xl focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
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
            )}

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
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
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
                type="number"
                value={formData.value || ""}
                onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
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
      <Dialog open={isAdditionalSalaryModalOpen} onOpenChange={setIsAdditionalSalaryModalOpen}>
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
                  type="number"
                  inputMode="decimal"
                  value={additionalSalaryFormData.value || ""}
                  onChange={(e) => setAdditionalSalaryFormData({ ...additionalSalaryFormData, value: parseFloat(e.target.value) || 0 })}
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
      <Dialog open={isRecurringActionModalOpen} onOpenChange={setIsRecurringActionModalOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-2xl border-white/10 text-white w-[95vw] sm:max-w-[400px] rounded-3xl">
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
                className="justify-start border-white/20 hover:bg-white/20 text-white bg-white/10"
                onClick={() => handleRecurringAction("only-this")}
                disabled={isSaving}
              >
                {recurringActionType === "edit" ? "Alterar somente esta" : "Excluir somente esta"}
              </Button>
              <Button 
                variant="outline" 
                className="justify-start border-white/20 hover:bg-white/20 text-white bg-white/10"
                onClick={() => handleRecurringAction("all-pending")}
                disabled={isSaving}
              >
                {recurringActionType === "edit" ? "Alterar todas pendentes" : "Excluir todas pendentes"}
              </Button>
              <Button 
                variant="outline" 
                className="justify-start border-white/20 hover:bg-white/20 text-white bg-white/10"
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

      {/* Share Modal */}
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
    </div>
  </div>
  );
}
