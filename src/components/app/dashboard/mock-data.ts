export type TransactionStatus = 'Completed' | 'Pending' | 'Failed'

export type MetricTrend = {
  label: string
  direction: 'up' | 'down'
}

export const MOCK_BALANCE = {
  name: 'Carla Rosner',
  balance: 562_000,
  expiry: '06/28',
  cvv: '09X',
}

export const MOCK_QUICK_ACTIONS = [
  { id: 'top-up', label: 'Top Up' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'request', label: 'Request' },
  { id: 'history', label: 'History' },
] as const

export const MOCK_DAILY_LIMIT = {
  spent: 2500,
  limit: 20_000,
  percent: 12.5,
}

export const MOCK_SAVING_PLANS = [
  {
    name: 'Emergency Fund',
    current: 4100,
    target: 10_000,
    percent: 41,
  },
  {
    name: 'Vacation Fund',
    current: 7825,
    target: 12_000,
    percent: 65,
  },
  {
    name: 'Home Down Payment',
    current: 25_500,
    target: 50_000,
    percent: 51,
  },
]

export const MOCK_METRICS = [
  {
    label: 'Total Income',
    amount: 78_000,
    trend: { label: '+1.73%', direction: 'up' as const },
  },
  {
    label: 'Total Expense',
    amount: 43_000,
    trend: { label: '-1.78%', direction: 'down' as const },
  },
  {
    label: 'Total Savings',
    amount: 56_000,
    trend: { label: '+1.24%', direction: 'up' as const },
  },
]

export const MOCK_CASHFLOW = [
  { month: 'Jan', income: 42, expense: 28 },
  { month: 'Feb', income: 48, expense: 31 },
  { month: 'Mar', income: 45, expense: 34 },
  { month: 'Apr', income: 52, expense: 30 },
  { month: 'May', income: 58, expense: 36 },
  { month: 'Jun', income: 62, expense: 40 },
  { month: 'Jul', income: 55, expense: 33 },
  { month: 'Aug', income: 60, expense: 38 },
  { month: 'Sep', income: 57, expense: 35 },
  { month: 'Oct', income: 64, expense: 41 },
  { month: 'Nov', income: 59, expense: 37 },
  { month: 'Dec', income: 68, expense: 44 },
]

export const MOCK_TRANSACTIONS: Array<{
  name: string
  category: string
  date: string
  amount: string
  note: string
  status: TransactionStatus
}> = [
  {
    name: 'Electricity Bill',
    category: 'Utilities',
    date: '18 Sep 2028 · 10:00 AM',
    amount: '-$150.00',
    note: 'Monthly utility',
    status: 'Pending',
  },
  {
    name: 'Deposit Savings',
    category: 'Income',
    date: '17 Sep 2028 · 02:15 PM',
    amount: '+$300.00',
    note: 'Emergency fund',
    status: 'Completed',
  },
  {
    name: 'Grocery Market',
    category: 'Shopping',
    date: '16 Sep 2028 · 06:40 PM',
    amount: '-$86.40',
    note: 'Weekly groceries',
    status: 'Completed',
  },
  {
    name: 'Cable Subscription',
    category: 'Bills',
    date: '15 Sep 2028 · 09:12 AM',
    amount: '-$49.99',
    note: 'Internet & TV',
    status: 'Failed',
  },
  {
    name: 'Freelance Payment',
    category: 'Income',
    date: '14 Sep 2028 · 11:30 AM',
    amount: '+$1,200.00',
    note: 'Client invoice',
    status: 'Completed',
  },
]

export const MOCK_EXPENSE_BREAKDOWN = [
  { label: 'Rent & Living', amount: 2100, percent: 60 },
  { label: 'Investment', amount: 525, percent: 15 },
  { label: 'Education', amount: 420, percent: 12 },
  { label: 'Food & Drink', amount: 280, percent: 8 },
  { label: 'Entertainment', amount: 175, percent: 5 },
]

export const MOCK_ACTIVITY = [
  {
    day: 'Today',
    items: [
      {
        name: 'Alex Johnson',
        action: 'logged in from a new device',
        time: '2 min ago',
      },
      {
        name: 'Maya Chen',
        action: 'updated account settings',
        time: '1 hour ago',
      },
    ],
  },
  {
    day: 'Yesterday',
    items: [
      {
        name: 'Jordan Lee',
        action: 'completed a transfer of $250',
        time: 'Yesterday · 6:20 PM',
      },
      {
        name: 'Sam Rivera',
        action: 'added a new saving plan',
        time: 'Yesterday · 3:05 PM',
      },
    ],
  },
]

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}
