import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

import {
  Lightbulb,
  Brain,
  CheckCircle,
  X,
  Star,
  Calendar,
  LineChart as LineChartIcon,
  BarChart as BarChartLucide,
  CircleSlash,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Award,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Target,
  FolderHeart,
  PieChart as PieChartIcon,
  CheckCircle2,
  XCircle,
  Tag,
  ListChecks,
  ChevronDown,
  Users,         // <-- New
  TrendingUp,    // <-- New
  DollarSign,    // <-- New
  ShoppingBag    // <-- New
} from 'lucide-react';


import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart , Bar, Area, AreaChart, ReferenceLine, Cell, PieChart, Pie } from 'recharts';
import { ResponsivePie } from '@nivo/pie';
import { safeNumber, safeString, createSafeObject, createPieData } from './utils/chart-helpers';

// Types

interface CategoryAnalysis {
  category: string;
  pros: string[];
  cons: string[];
  sentimental_categories: string[];
  detail_counts: { [key: string]: number };
  sentiment_counts: { positive: number; negative: number; neutral: number };
}

interface OverallReport {
  overall_sentiment: {
    positive: number;
    negative: number;
    neutral: number;
  };

  sentiment_counts: {
    positive: number;
    negative: number;
    neutral: number;
    [key: string]: number; // in case there are other sentiments
  };

  total_reviews: number;
  last_updated: string;
}

interface MonthlyFeedbackItem {
  month: string;
  top_positive: Array<{
    category: string;
    sentiment: string; // e.g. "positive"
    count: number;
  }>;
  top_negative: Array<{
    category: string;
    sentiment: string; // e.g. "negative"
    count: number;
  }>;
}

interface MonthlyFeedbackResponse {
  data: MonthlyFeedbackItem[];
}

interface OverallDetailReport {
  overall_sentiment_detail: {
    [key: string]: number;
  };
  total_reviews: number;
  last_updated: string;
}

interface TrendData {
  month: string;
  positive: number;
  negative: number;
  neutral: number;
}

interface TrendDataWithFeedback extends TrendData {
  top_positive: Array<{ category: string; count: number }>;
  top_negative: Array<{ category: string; count: number }>;
}

interface TopFeedback {
  category: string;
  count: number;
}

interface ComparisonData {
  platform: string;
  positive: number;
  negative: number;
  neutral: number;
}

interface ProsCons {
  pros: Array<{ text: string; count: number }>;
  cons: Array<{ text: string; count: number }>;
}

interface RiskAlert {
  message: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
}

interface DetailCategory {
  overall_sentiment_detail: string;
  categories: string[];
  overall_sentimental_categories: string[];
}

interface DetailCategoryReport {
  details: DetailCategory[];
}


interface MonthlyReportData {
  _id: string;
  company: string;
  company_id: string;
  created_at: string;
  time_period: string;
  time_period_label: string;
  aggregated_data: {
    positive: Array<{
      _id: {
        month: string;
        sentiment: string;
        category: string;
      };
      titles: string[];
      count: number;
    }>;
    negative: Array<{
      _id: {
        month: string;
        sentiment: string;
        category: string;
      };
      titles: string[];
      count: number;
    }>;
  };
  positive_insight: {
    key_strengths: string[];
    best_practices_to_continue: string[];
    actionable_recommendations: string[];
  };
  negative_insight: {
    key_weaknesses: string[];
    actionable_recommendations: string[];
  };
  overall_positive: number;
  overall_negative: number;
  overall_neutral: number;
  total_reviews: number;
  positive_insight_small: string[];
  negative_insight_small: string[];
}

// Emotion color mapping
const emotionColors: { [key: string]: string } = {
  angry: '#EF4444',
  disappointed: '#F97316',
  dissatisfied: '#F59E0B',
  frustrated: '#EAB308',
  happy: '#10B981',
  neutral: '#6B7280',
  sad: '#6366F1',
  satisfied: '#22C55E'
};


function MonthlyFeedbackTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const dataPoint: TrendDataWithFeedback = payload[0].payload;
  return (
    <div className="p-3 bg-black text-white rounded shadow-md">
      <div className="mb-2 font-bold">{label}</div>
      <div className="text-sm mb-1">
        Positive: {dataPoint.positive} | Negative: {dataPoint.negative} | Neutral: {dataPoint.neutral}
      </div>
      {dataPoint.top_positive && dataPoint.top_positive.length > 0 && (
        <>
          <div className="font-semibold mt-2 text-green-400">Top 3 Strengths:</div>
          {dataPoint.top_positive.map((pos, idx) => (
            <div key={idx} className="text-xs text-gray-200">
              • {pos.category} ({pos.count} mentions)
            </div>
          ))}
        </>
      )}
      {dataPoint.top_negative && dataPoint.top_negative.length > 0 && (
        <>
          <div className="font-semibold mt-2 text-red-400">Top 3 Critical:</div>
          {dataPoint.top_negative.map((neg, idx) => (
            <div key={idx} className="text-xs text-gray-200">
              • {neg.category} ({neg.count} mentions)
            </div>
          ))}
        </>
      )}
    </div>
  );
}


function App() {


  const [selectedCompany, setSelectedCompany] = useState<string>('cook_and_pan');
  const [monthlyFeedback, setMonthlyFeedback] = useState<MonthlyFeedbackItem[]>([]);
  // Some new useState lines near your other states:
  const [selectedIssueReviews, setSelectedIssueReviews] = useState<any[]>([]);
  const [issueModalOpen, setIssueModalOpen] = useState(false);

  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [categoryDetails, setCategoryDetails] = useState<DetailCategory | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  interface ShopifyInsights {
    company: string;
    total_gross_sales: number;
    total_customers: number;
    total_orders: number; // <--- Add this

    best_selling_products: Array<{
      product: string;
      quantity_sold: number;
      revenue: number;
    }>;
  }
  
  const [shopifyData, setShopifyData] = useState<ShopifyInsights | null>(null);
  
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [timeFilter, setTimeFilter] = useState('30');
  const [overallData, setOverallData] = useState<OverallReport>({
    overall_sentiment: { positive: 0, negative: 0, neutral: 0 },
    sentiment_counts: { positive: 0, negative: 0, neutral: 0 },

    total_reviews: 0,
    last_updated: new Date().toISOString()
  });
  const [emotionalData, setEmotionalData] = useState<OverallDetailReport>({
    overall_sentiment_detail: {},
    total_reviews: 0,
    last_updated: new Date().toISOString()
  });
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [positiveFeedback, setPositiveFeedback] = useState<TopFeedback[]>([]);
  const [criticalIssues, setCriticalIssues] = useState<TopFeedback[]>([]);
  const [comparisonData, setComparisonData] = useState<ComparisonData[]>([]);
  const [prosCons, setProsCons] = useState<ProsCons>({ pros: [], cons: [] });
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllPositive, setShowAllPositive] = useState(false);
  const [showAllNegative, setShowAllNegative] = useState(false);
  const [combinedTrendData, setCombinedTrendData] = useState<TrendDataWithFeedback[]>([]);
  const [subCategories, setSubCategories] = useState<TopFeedback[]>([]);
  const [showSubCategoryModal, setShowSubCategoryModal] = useState(false);
  const [parentCategoryClicked, setParentCategoryClicked] = useState<string | null>(null);
  const [parentSentiment, setParentSentiment] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
const [categoryAnalysis, setCategoryAnalysis] = useState<CategoryAnalysis | null>(null);
const [expandedSection, setExpandedSection] = useState<'pros' | 'cons' | 'sentiment' | null>(null);
const [categories] = useState<string[]>([
  'Customer Service',
  'Product Quality',
  'Returns & Refunds',
  'Website Performance',
  'Order Fulfillment',
  'Shipping',
  'Checkout Experience',
  'Payment & Billing',
  'Delivery Partner Issues',
  'Pricing & Discounts'
]);




  const API_BASE_URL = 'https://everest-sentimental-dashboard-backend.onrender.com';
  // const API_BASE_URL = "http://127.0.0.1:8080"


  // Monthly Report

  

  
  function MonthlyReportView({ API_BASE_URL, selectedCompany }: { API_BASE_URL: string; selectedCompany: string }) {
    const today = new Date();
    const localYear = today.getFullYear();
    const localMonth = ("0" + (today.getMonth() + 1)).slice(-2); // getMonth() is 0-indexed
    const selectedMonthLocal = `${localYear}-${localMonth}`;

    // const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
    const [selectedMonth, setSelectedMonth] = useState<string>(selectedMonthLocal);

    const [monthlyReport, setMonthlyReport] = useState<MonthlyReportData | null>(null);
    const [monthlyReportLoading, setMonthlyReportLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
  
    // ================================
    // 2.1.1. This is the main fetcher
    // ================================
    const fetchMonthlyReport = useCallback(async () => {
      try {
        setMonthlyReportLoading(true);
        setError(null);
  
        const url = `${API_BASE_URL}/report/monthly_analysis`;
        const year = parseInt(selectedMonth.slice(0, 4));
        const monthNumber = parseInt(selectedMonth.slice(5, 7));
  
        const response = await axios.get(url, { 
          params: { company: selectedCompany, year, month: monthNumber }
        });
  
        // Check for no data (or 404)
        if (response.status === 404 || !response.data) {
          setMonthlyReport(null);
        } else {
          setMonthlyReport(response.data);
        }
      } catch (err: any) {
        if (err.response && err.response.status === 404) {
          setMonthlyReport(null);
        } else {
          setError('Failed to fetch monthly report');
        }
        console.error(err);
      } finally {
        setMonthlyReportLoading(false);
      }
    }, [API_BASE_URL, selectedCompany, selectedMonth]);
  
    useEffect(() => {
      fetchMonthlyReport();
    }, [fetchMonthlyReport]);
  
  
    // ======================
    // 2.1.2. Helper function
    // ======================
    const calculateSentimentScore = () => {
      if (!monthlyReport) return 0;
      const total = monthlyReport.overall_positive + monthlyReport.overall_negative;
      if (total === 0) return 0;
      return ((monthlyReport.overall_positive / total) * 100).toFixed(1);
    };


    const renderMetricCard = (title: string, value: number | string, icon: React.ReactNode, color: string) => (
      <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
        <div className="flex items-center gap-3">
          <div className={`${color} p-3 rounded-lg`}>
            {icon}
          </div>
          <div>
            <h3 className="text-xl font-medium text-gray-400">{title}</h3>
            <p className="text-3xl font-bold text-white">{value}</p>
          </div>
        </div>
      </div>
    );
  
    // =======================
    // 2.1.3. Render function
    // =======================
    
  
    // // 2.1.4. Reusable card renderer
    // const renderMetricCard = (title: string, value: number | string, icon: React.ReactNode, color: string) => (
    //   <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
    //     <div className="flex items-center gap-3">
    //       <div className={`${color} p-3 rounded-lg`}>
    //         {icon}
    //       </div>
    //       <div>
    //         <h3 className="text-xl font-medium text-gray-400">{title}</h3>
    //         <p className="text-3xl font-bold text-white">{value}</p>
    //       </div>
    //     </div>
    //   </div>
    // );
    
    function renderQuickInsightsSection() {
      if (!monthlyReport) return null;
    
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Quick Wins */}
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Lightbulb className="w-6 h-6 text-green-500" />
              </div>
              <h2 className="text-3xl font-semibold">Quick Wins</h2>
            </div>
            <div className="space-y-3">
              {monthlyReport.positive_insight_small?.map((insight, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-green-500/5 rounded-lg"
                >
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <p className="text-gray-300 text-xl">{insight}</p>
                </div>
              ))}
            </div>
          </div>
    
          {/* Priority Focus Areas */}
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Brain className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-3xl font-semibold">Priority Focus Areas</h2>
            </div>
            <div className="space-y-3">
              {monthlyReport.negative_insight_small?.map((insight, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-red-500/5 rounded-lg"
                >
                  <XCircle className="w-5 h-5 text-red-500" />
                  <p className="text-gray-300 text-xl">{insight}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        
      );
    }

    if (monthlyReportLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-xl text-gray-400">Loading Monthly Report...</div>
        </div>
      );
    }
  
    if (error) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-xl text-red-400">{error}</div>
        </div>
      );
    }
  
    if (!monthlyReport && !monthlyReportLoading && !error) {
      return (
        <div className="text-center text-gray-300 text-xl py-10">
          No data available for this month
        </div>
      );
    }
    return (
      <div>
        {/* ============ Header with Month Controls ============ */}
        <div className="flex items-center justify-between mb-8 bg-white/5 backdrop-blur-lg rounded-xl p-4 border border-white/10">
          <button
            onClick={() => {
              const date = new Date(selectedMonth);
              date.setMonth(date.getMonth() - 1);
              setSelectedMonth(date.toISOString().slice(0, 7));
            }}
            className="p-2 hover:bg-white/10 rounded-lg transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-lg font-semibold focus:outline-none"
            />
          </div>
          {/* Show loading state */}
    {monthlyReportLoading && (
      <div className="text-center text-gray-400 py-10">Loading Monthly Report...</div>
    )}

    {/* Show error state */}
    {error && (
      <div className="text-center text-red-400 py-10">{error}</div>
    )}

    {/* Show no data message if monthlyReport is null */}
    {!monthlyReport && !monthlyReportLoading && !error && (
      <div className="text-center text-gray-300 text-xl py-10">
        No data available for this month
      </div>
    )}
          <button
            onClick={() => {
              const date = new Date(selectedMonth);
              date.setMonth(date.getMonth() + 1);
              setSelectedMonth(date.toISOString().slice(0, 7));
            }}
            className="p-2 hover:bg-white/10 rounded-lg transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {(!monthlyReport && !monthlyReportLoading && !error) && (
        <div className="text-center text-gray-300 text-xl py-10">
          No data available for this month
        </div>
      )}
  
        {/* ============== Overview Stats Grid ================ */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {renderMetricCard(
          "Total Reviews",
          monthlyReport.total_reviews,
          <MessageSquare className="w-8 h-8 text-blue-500" />,
          "bg-blue-500/10"
        )}
        {renderMetricCard(
          "Positive Reviews",
          monthlyReport.overall_positive,
          <ThumbsUp className="w-8 h-8 text-green-500" />,
          "bg-green-500/10"
        )}
        {renderMetricCard(
          "Negative Reviews",
          monthlyReport.overall_negative,
          <ThumbsDown className="w-8 h-8 text-red-500" />,
          "bg-red-500/10"
        )}
        {renderMetricCard(
          "Sentiment Score",
          calculateSentimentScore() + '%',
          <BarChartLucide className="w-8 h-8 text-purple-500" />,
          "bg-purple-500/10"
        )}
      </div>


         {/* Quick Wins & Priority Focus Areas */}
    {renderQuickInsightsSection()}
  
        {/* ============ Key Strengths, Weaknesses, etc. ============ */}
        <div className="grid grid-cols-1 gap-6 mb-8">
  
          {/* Key Strengths */}
<div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
  <div className="flex items-center gap-3 mb-6">
    <div className="p-2 bg-green-500/10 rounded-lg">
      <Award className="w-6 h-6 text-green-500" />
    </div>
    <h2 className="text-3xl font-semibold">Key Strengths</h2>
  </div>
  {(monthlyReport.positive_insight?.key_strengths || []).map((strength, i) => (
    <div
      key={i}
      className="flex items-start gap-3 p-4 bg-white/5 rounded-lg mb-2"
    >
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/10 text-sm mt-0.5">
        {i + 1}
      </div>
      <p className="text-gray-300 text-xl">{strength}</p>
    </div>
  ))}

  {/* Best Practices & Recommendations go here */}
  <div className="border-t border-white/10 pt-6">
    <h3 className="text-3xl font-medium mb-4">Best Practices & Recommendations</h3>
    <div className="space-y-4">
      {[
        ...monthlyReport?.positive_insight.best_practices_to_continue || [],
        ...monthlyReport?.positive_insight.actionable_recommendations || []
      ].map((item, index) => (
        <div key={index} className="flex items-start gap-3 p-4 bg-white/5 rounded-lg">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/10 text-sm mt-0.5">
            {index + 1}
          </div>
          <p className="text-gray-300 text-xl">{item}</p>
        </div>
      ))}
    </div>
  </div>
</div>


  
          {/* Weaknesses */}
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-3xl font-semibold">Areas for Improvement</h2>
            </div>
            {(monthlyReport.negative_insight?.key_weaknesses || []).map((weakness, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 bg-red-500/5 rounded-lg border border-red-500/10 mb-2"
              >
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500/10 text-sm mt-0.5">
                  {i + 1}
                </div>
                <p className="text-gray-300 text-xl">{weakness}</p>
              </div>
            ))}
          </div>
  
          {/* Actionable Recommendations */}
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <Target className="w-6 h-6 text-yellow-500" />
              </div>
              <h2 className="text-3xl font-semibold">Action Items</h2>
            </div>
            {(monthlyReport.negative_insight?.actionable_recommendations || []).map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 bg-yellow-500/5 rounded-lg border border-yellow-500/10 mb-2"
              >
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500/10 text-sm mt-0.5">
                  {i + 1}
                </div>
                <p className="text-gray-300 text-xl">{item}</p>
              </div>
            ))}
          </div>
        </div>
  
        {/* ================ Category Analysis ================ */}
        <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 mb-8">
        <div className="flex items-center gap-3 mb-6">
          {/* Increase the icon size from w-6 h-6 to w-8 h-8 */}
          <BarChartLucide className="w-8 h-8 text-purple-500" />
          {/* Increase heading from text-xl to text-2xl */}
          <h2 className="text-2xl font-semibold">Category Analysis</h2>
        </div>

          <div className="space-y-8">
            {/* Positive Categories */}
            <div>
              <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                <ThumbsUp className="w-5 h-5 text-green-500" />
                <span>Positive Feedback Categories</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {monthlyReport.aggregated_data.positive.map((cat, index) => (
                  <div key={index} className="p-4 rounded-lg bg-green-500/5 border border-green-500/10">
                    <h4 className="text-lg font-medium mb-2">{cat._id.category}</h4>
                    <p className="text-base text-gray-400 mb-3">{cat.count} mentions</p>
                    <div className="space-y-2">
                      {cat.titles.slice(0, 3).map((title, i) => (
                        <p key={i} className="text-sm text-gray-500">• {title}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
  
            {/* Negative Categories */}
            <div>
              <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                <ThumbsDown className="w-5 h-5 text-red-500" />
                <span>Areas Needing Attention</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {monthlyReport.aggregated_data.negative.map((cat, index) => (
                  <div key={index} className="p-4 rounded-lg bg-red-500/5 border border-red-500/10">
                    <h4 className="text-lg font-medium mb-2">{cat._id.category}</h4>
                    <p className="text-base text-gray-400 mb-3">{cat.count} mentions</p>
                    <div className="space-y-2">
                      {cat.titles.slice(0, 3).map((title, i) => (
                        <p key={i} className="text-sm text-gray-500">• {title}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  

  
  const fetchCategoryAnalysis = useCallback(async (category: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/report/category_analysis`, {
        params: { category, company: selectedCompany }
      });
      setCategoryAnalysis(response.data);
      setSelectedCategory(category);
    } catch (err) {
      console.error('Error fetching category analysis:', err);
      setError('Failed to fetch category analysis');
    }
  }, [API_BASE_URL, selectedCompany]);
  
  

  const processEmotionalData = useCallback((data: any): OverallDetailReport => {
    const defaultData: OverallDetailReport = {
      overall_sentiment_detail: {},
      total_reviews: 0,
      last_updated: new Date().toISOString()
    };

    if (!data || typeof data !== 'object') return defaultData;

    return {
      overall_sentiment_detail: data.overall_sentiment_detail || {},
      total_reviews: safeNumber(data.total_reviews),
      last_updated: safeString(data.last_updated) || defaultData.last_updated
    };
  }, []);

  const processOverallData = useCallback((data: unknown): OverallReport => {
    const defaultData: OverallReport = {
      overall_sentiment: { positive: 0, negative: 0, neutral: 0 },
      total_reviews: 0,
      last_updated: new Date().toISOString()
    };

    if (!data || typeof data !== 'object') return defaultData;

    const safeData = data as any;
    return {
      overall_sentiment: {
        positive: safeNumber(safeData?.overall_sentiment?.positive),
        negative: safeNumber(safeData?.overall_sentiment?.negative),
        neutral: safeNumber(safeData?.overall_sentiment?.neutral)
      },
      total_reviews: safeNumber(safeData?.total_reviews),
      last_updated: safeString(safeData?.last_updated) || defaultData.last_updated
    };
  }, []);

  const processFeedbackData = useCallback((data: unknown): TopFeedback[] => {
    if (!Array.isArray(data)) return [];
    
    return data.map(item => ({
      category: safeString((item as any)?.category),
      count: safeNumber((item as any)?.count)
    })).filter(item => item.category && item.count > 0);
  }, []);

  const processTrendData = useCallback((data: unknown): TrendData[] => {
    if (!Array.isArray(data)) return [];

    return data.map(item => ({
      month: safeString((item as any)?.month),
      positive: safeNumber((item as any)?.positive),
      negative: safeNumber((item as any)?.negative),
      neutral: safeNumber((item as any)?.neutral)
    })).filter(item => item.month);
  }, []);

  const processComparisonData = useCallback((data: unknown): ComparisonData[] => {
    if (!Array.isArray(data)) return [];

    return data.map(item => ({
      platform: safeString((item as any)?.platform),
      positive: safeNumber((item as any)?.positive),
      negative: safeNumber((item as any)?.negative),
      neutral: safeNumber((item as any)?.neutral)
    })).filter(item => item.platform);
  }, []);

  // CompanySelector Component
  // Place this inside your App component, near other selector components:
const CompanySelector = () => (
  <div className="mb-6 flex items-center gap-4">
    {[
      { display: "Cook and Pan", value: "cook_and_pan" },
      { display: "Cozy Heaven", value: "cozy_heaven" }
    ].map((company) => (
      <button
        key={company.value}
        onClick={() => setSelectedCompany(company.value)}
        className={`px-3 py-1 rounded-lg transition-all ${
          selectedCompany === company.value
            ? 'bg-white/20 text-white'
            : 'hover:bg-white/10 text-gray-400'
        }`}
      >
        {company.display}
      </button>
    ))}
  </div>
);


  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        // days: timeFilter,
        platform: selectedPlatform !== 'all' ? selectedPlatform : undefined,
        company: selectedCompany,  // <-- Add this

      };

      const [
        overallRes,
        emotionalRes,
        trendRes,
        positiveRes,
        negativeRes,
        comparisonRes,
        prosConsRes,
        riskAlertsRes,
        monthlyFeedbackRes 
      ] = await Promise.all([
        axios.get(`${API_BASE_URL}/report/overall_by_platform`, { params })
          .catch(() => ({ data: null })),
        axios.get(`${API_BASE_URL}/report/overall_detail`, { params })
          .catch(() => ({ data: null })),
        axios.get(`${API_BASE_URL}/report/trends`, { params })
          .catch(() => ({ data: { trends: [] } })),
        axios.get(`${API_BASE_URL}/report/category_table`, {
          params: { ...params, sentiment: 'positive', limit: showAllPositive ? 10 : 3 }
        }).catch(() => ({ data: { table: [] } })),
        axios.get(`${API_BASE_URL}/report/category_table`, {
          params: { ...params, sentiment: 'negative', limit: showAllNegative ? 10 : 3 }
        }).catch(() => ({ data: { table: [] } })),
        axios.get(`${API_BASE_URL}/report/platform_comparison`, { params: { days: timeFilter, company: selectedCompany } })

          .catch(() => ({ data: { platforms: [] } })),
        axios.get(`${API_BASE_URL}/report/pros_cons`, { params })
          .catch(() => ({ data: { pros: [], cons: [] } })),
        axios.get(`${API_BASE_URL}/report/risk_alerts`, { params })
          .catch(() => ({ data: { alerts: [] } })),
        axios.get(`${API_BASE_URL}/report/monthly_feedback`, { params }) // new

      ]);

    setOverallData({
      overall_sentiment: overallRes.data?.overall_sentiment || { positive: 0, negative: 0, neutral: 0 },
      sentiment_counts: overallRes.data?.sentiment_counts || { positive: 0, negative: 0, neutral: 0 },
      total_reviews: overallRes.data?.total_reviews || 0,
      last_updated: overallRes.data?.last_updated || new Date().toISOString()
    });
      setEmotionalData(processEmotionalData(emotionalRes.data));
      setTrendData(processTrendData(trendRes.data?.trends));
      setPositiveFeedback(processFeedbackData(positiveRes.data?.table));
      setCriticalIssues(processFeedbackData(negativeRes.data?.table));
      setComparisonData(processComparisonData(comparisonRes.data?.platforms));
      setProsCons(createSafeObject(prosConsRes.data, { pros: [], cons: [] }));
      setRiskAlerts(riskAlertsRes.data?.alerts || []);
      setMonthlyFeedback(monthlyFeedbackRes.data.data || []);


    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  }, [
    timeFilter,
    selectedPlatform,
    showAllPositive,
    showAllNegative,
    selectedCompany,
    processOverallData,
    processEmotionalData,
    processTrendData,
    processFeedbackData,
    processComparisonData
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  

  useEffect(() => {
    // Combine trendData and monthlyFeedback into one array
    if (trendData.length && monthlyFeedback.length) {
      const combined = trendData.map((td) => {
        const matching = monthlyFeedback.find((m) => m.month === td.month);
        return {
          ...td,
          top_positive: matching ? matching.top_positive : [],
          top_negative: matching ? matching.top_negative : []
        };
      });
      setCombinedTrendData(combined);
    }
  }, [trendData, monthlyFeedback]);
  
  const fetchShopifyData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_BASE_URL}/shopify_insights`, {
        params: { company: selectedCompany }
      });
      setShopifyData(response.data);
    } catch (err) {
      console.error("Error fetching Shopify data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch Shopify data");
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, API_BASE_URL]);

  useEffect(() => {
    if (activeTab === 'shopify') {
      fetchShopifyData();
    }
  }, [activeTab, fetchShopifyData]);

  // for pros cons front overview code
  const handleParentTileClick = async (categoryName: string, sentiment: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/report/overall_sentimental_category_pros_cons`, {
        params: { parent_category: categoryName, sentiment, company: selectedCompany }
      });
      // Assuming the API returns an object with "table" as an array of sub-categories
      setSubCategories(response.data.table);
      setParentCategoryClicked(categoryName);
      setParentSentiment(sentiment);
      setShowSubCategoryModal(true);
    } catch (error) {
      console.error("Error fetching sentimental categories", error);
      setError("Failed to fetch sub-categories");
    }
  };
  
  
  const pieChartData = useMemo(() => 
    createPieData(overallData.overall_sentiment),
    [overallData.overall_sentiment]
  );

  const emotionalChartData = useMemo(() => {
    return Object.entries(emotionalData.overall_sentiment_detail).map(([emotion, value]) => ({
      emotion,
      value,
      color: emotionColors[emotion] || '#6B7280'
    })).sort((a, b) => b.value - a.value);
  }, [emotionalData.overall_sentiment_detail]);

  const positiveAverage = useMemo(() => {
    if (!trendData.length) return 0;
    return trendData.reduce((sum, item) => sum + item.positive, 0) / trendData.length;
  }, [trendData]);

  const negativeAverage = useMemo(() => {
    if (!trendData.length) return 0;
    return trendData.reduce((sum, item) => sum + item.negative, 0) / trendData.length;
  }, [trendData]);

  // Platform selector component
  const PlatformSelector = () => (
    <div className="mb-6 flex items-center gap-4">
      <div className="flex gap-2">
        {['all', 'gorgias', 'trustpilot', 'opencx'].map((platform) => (
          <button
            key={platform}
            onClick={() => setSelectedPlatform(platform)}
            className={`px-3 py-1 rounded-lg transition-all ${
              selectedPlatform === platform
                ? 'bg-white/20 text-white'
                : 'hover:bg-white/10 text-gray-400'
            }`}
          >
            {platform.charAt(0).toUpperCase() + platform.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
  const CategoryAnalysisSection = () => {
    if (!categoryAnalysis) return null;
  
    const sentimentData = [
      { name: 'Positive', value: categoryAnalysis.sentiment_counts.positive, color: '#10B981' },
      { name: 'Negative', value: categoryAnalysis.sentiment_counts.negative, color: '#EF4444' },
      { name: 'Neutral', value: categoryAnalysis.sentiment_counts.neutral, color: '#6B7280' }
    ];
  
    const detailData = Object.entries(categoryAnalysis.detail_counts).map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value,
      color: emotionColors[key] || '#6B7280'
    }));
  
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">
            Category Analysis: {categoryAnalysis.category}
          </h2>
          <button
            onClick={() => setSelectedCategory(null)}
            className="p-2 hover:bg-white/10 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
  
        {/* Sentiment and Detail Counts as cards with emoticons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sentiment Distribution Card */}
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Sentiment Distribution</h3>
              <button
                onClick={() => setExpandedSection(expandedSection === 'sentiment' ? null : 'sentiment')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <ChevronDown className={`w-5 h-5 transform transition-transform ${expandedSection === 'sentiment' ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="120%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {sentimentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px'
                  }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
  
          {/* Emotional Distribution Card */}
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <h3 className="text-lg font-semibold mb-4">Emotional Distribution</h3>
            <div className="space-y-4">
              {detailData.map((item) => (
                <div key={item.name} className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-400">{item.name}</span>
                    <span className="text-sm font-medium">{item.value}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(item.value / Math.max(...detailData.map(d => d.value))) * 100}%`,
                        backgroundColor: item.color
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
  
        {/* Cards for Pros and Cons with emoticons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pros Card */}
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <h3 className="text-lg font-semibold">Pros</h3>
              </div>
              <button
                onClick={() => setExpandedSection(expandedSection === 'pros' ? null : 'pros')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <ChevronDown className={`w-5 h-5 transform transition-transform ${expandedSection === 'pros' ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div className="space-y-3">
              {categoryAnalysis.pros.map((pro, index) => (
                <div
                  key={index}
                  className="p-3 bg-green-500/5 rounded-lg border border-green-500/10 hover:bg-green-500/10 transition-colors"
                >
                  <p className="text-gray-300">{pro}</p>
                </div>
              ))}
            </div>
          </div>
  
          {/* Cons Card */}
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-semibold">Cons</h3>
              </div>
              <button
                onClick={() => setExpandedSection(expandedSection === 'cons' ? null : 'cons')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <ChevronDown className={`w-5 h-5 transform transition-transform ${expandedSection === 'cons' ? 'rotate-180' : ''}`} />
              </button>
            </div>
            <div className="space-y-3">
              {categoryAnalysis.cons.map((con, index) => (
                <div
                  key={index}
                  className="p-3 bg-red-500/5 rounded-lg border border-red-500/10 hover:bg-red-500/10 transition-colors"
                >
                  <p className="text-gray-300">{con}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
  
        {/* Sentimental Categories Card */}
        <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold">Sentimental Categories</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {categoryAnalysis.sentimental_categories.map((category, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-sm border border-blue-500/20"
              >
                {category.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };
  
  // Emotional Distribution Component
  // const EmotionalDistribution = () => (
  //   <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 mb-8">
  //     <h2 className="text-xl font-semibold mb-4">Emotional Distribution</h2>
  //     <div className="h-64">
  //       <ResponsiveContainer width="100%" height="100%">
  //         <PieChart>
  //           <Pie
  //             data={emotionalChartData}
  //             dataKey="value"
  //             nameKey="emotion"
  //             cx="50%"
  //             cy="50%"
  //             outerRadius={80}
  //             label
  //           >
  //             {emotionalChartData.map((entry, index) => (
  //               <Cell key={`cell-${index}`} fill={entry.color} />
  //             ))}
  //           </Pie>
  //           <Tooltip
  //             contentStyle={{
  //               backgroundColor: 'rgba(0,0,0,0.8)',
  //               border: '1px solid rgba(255,255,255,0.1)',
  //               borderRadius: '8px'
  //             }}
  //             formatter={(value: number) => [`${value.toFixed(1)}%`, 'Percentage']}
  //           />
  //           <Legend />
  //         </PieChart>
  //       </ResponsiveContainer>
  //     </div>
  //   </div>
  // );
  const fetchCategoryDetails = useCallback(async (emotion: string) => {
    try {
      const params = {
        // days: timeFilter,
        platform: selectedPlatform !== 'all' ? selectedPlatform : undefined,
        company: selectedCompany, // will use the current selectedCompany
      };
      // Call the new backend endpoint /report/detail_categories
      const response = await axios.get<DetailCategoryReport>(`${API_BASE_URL}/report/detail_categories`, { params });
      console.log("detail_categories response:", response.data);
  
      const details = response.data.details;
      // Find the detail object matching the clicked emotion
      const found = details.find((d) => d.overall_sentiment_detail === emotion);
      if (found) {
        setCategoryDetails(found);
        setSelectedEmotion(emotion);
      } else {
        setCategoryDetails(null);
        setSelectedEmotion(null);
      }
    } catch (err) {
      console.error("Error fetching category details", err);
      setError("Failed to fetch category details");
    }
  }, [timeFilter, selectedPlatform, selectedCompany]);
  
  

  const handleEmotionClick = useCallback((emotion: string) => {
    fetchCategoryDetails(emotion);
  }, [fetchCategoryDetails]);


  // Add this new component definition to replace the pie chart
  function EmotionalStats({ emotionalData, onEmotionClick }: { 
    emotionalData: { overall_sentiment_detail: Record<string, { count: number; percentage: number }> };
    onEmotionClick: (emotion: string) => void;
  }) {
    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Emotional Analysis</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(emotionalData.overall_sentiment_detail).map(([emotion, stats]) => {
            const { count, percentage } = stats;
            return (
              <div
                key={emotion}
                className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 hover:bg-white/10 transition-all group cursor-pointer"
                style={{ borderLeftColor: emotionColors[emotion] || '#6B7280', borderLeftWidth: '4px' }}
                onClick={() => onEmotionClick(emotion)}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-medium capitalize text-gray-400">
                    {emotion}
                  </h3>
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: emotionColors[emotion] || '#6B7280' }}
                  />
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold">{percentage.toFixed(1)}%</p>
                  <p className="text-sm text-gray-300">({count} reviews)</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  

  function handleIssueClick(categoryName: string, sentiment: string) {
    axios.get(`${API_BASE_URL}/report/issue_details`, {
      params: { category: categoryName, sentiment: sentiment, company: selectedCompany }
    })
    .then(response => {
      console.log("Issue details response:", response.data); // Debug log
      // Ensure you set the full reviews array:
      setSelectedIssueReviews(response.data.reviews || []);
      setIssueModalOpen(true);
    })
    .catch(error => {
      console.error("Failed to fetch issue details", error);
    });
    
  }
  
  
  
  // In your render:
  {criticalIssues.map((item, index) => (
    <button
      key={index}
      onClick={() => handleIssueClick(item.category)}
      className="p-3 bg-white/5 rounded-lg text-left w-full hover:bg-white/10 transition"
    >
      <p className="text-gray-300">{item.category}</p>
      <p className="text-sm text-gray-500">Frequency: {item.count} mentions</p>
    </button>
  ))}
  
  // Example: a new block or tab
// function MonthlyFeedback({ monthlyFeedback }: MonthlyFeedbackProps) {
//     // If no data, show a placeholder
//     if (!monthlyFeedback.length) {
//       return <p className="text-gray-400">No monthly feedback data</p>;
//     }
  
//     return (
//       <div className="space-y-6">
//         <h2 className="text-xl font-semibold text-white mb-4">
//           Monthly Top 3 Strengths &amp; Critical Feedback
//         </h2>
  
//         {monthlyFeedback.map((item) => (
//           <div
//             key={item.month}
//             className="bg-white/5 p-4 rounded-md border border-white/10 mb-4"
//           >
//             <h3 className="text-lg font-bold text-white mb-4">
//               {item.month}
//             </h3>
  
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//               {/* Top Positive Categories */}
//               <div>
//                 <h4 className="text-md font-semibold text-green-400 mb-2">
//                   Top Positive
//                 </h4>
//                 {item.top_positive.length > 0 ? (
//                   item.top_positive.map((pos, i) => (
//                     <div
//                       key={i}
//                       className="p-3 mb-2 bg-green-500/5 rounded-lg border border-green-500/10"
//                     >
//                       <p className="text-lg text-gray-200 font-semibold">
//                         {pos.category}
//                         <span className="ml-2 text-sm text-gray-400">
//                           ({pos.count} mentions)
//                         </span>
//                       </p>
//                     </div>
//                   ))
//                 ) : (
//                   <p className="text-gray-400 text-sm">No positive feedback.</p>
//                 )}
//               </div>
  
//               {/* Top Negative Categories */}
//               <div>
//                 <h4 className="text-md font-semibold text-red-400 mb-2">
//                   Top Negative
//                 </h4>
//                 {item.top_negative.length > 0 ? (
//                   item.top_negative.map((neg, i) => (
//                     <div
//                       key={i}
//                       className="p-3 mb-2 bg-red-500/5 rounded-lg border border-red-500/10"
//                     >
//                       <p className="text-lg text-gray-200 font-semibold">
//                         {neg.category}
//                         <span className="ml-2 text-sm text-gray-400">
//                           ({neg.count} mentions)
//                         </span>
//                       </p>
//                     </div>
//                   ))
//                 ) : (
//                   <p className="text-gray-400 text-sm">No negative feedback.</p>
//                 )}
//               </div>
//             </div>
//           </div>
//         ))}
//       </div>
//     );
//   }

interface FeedbackItem {
  category: string;
  sentiment: string; // "positive" or "negative"
  count: number;
}
// interface MonthlyFeedbackItem {
//   month: string; // e.g. "2023-01"
//   top_positive: FeedbackItem[];
//   top_negative: FeedbackItem[];
// }

interface Props {
  data: MonthlyFeedbackItem[];
}

// interface MonthlyFeedbackProps {
//   monthlyFeedback: MonthlyFeedbackItem[];
// }

function MonthlyFeedbackCards({ data }: Props) {
  // Sort data descending so newest month is first
  const sortedData = [...data].sort((a, b) => b.month.localeCompare(a.month));

  // Show only last 12 months by default
  const [showAll, setShowAll] = useState(false);
  const displayedData = showAll ? sortedData : sortedData.slice(0, 12);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">
        Monthly Top 3 Strengths & Critical Feedback
      </h2>

      {displayedData.map((item) => (
        <div
          key={item.month}
          className="bg-white/5 p-6 rounded-lg border border-white/10"
        >
          <h3 className="text-2xl font-bold text-white mb-4">{item.month}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Positive Categories */}
            <div>
              <h4 className="text-xl font-semibold text-green-400 mb-3">
                Top 3 Strengths
              </h4>
              {item.top_positive.length > 0 ? (
                item.top_positive.map((pos, i) => (
                  <div
                    key={i}
                    className="p-4 mb-3 bg-green-500/5 rounded-lg border border-green-500/10"
                  >
                    <p className="text-2xl text-white font-bold">
                      {pos.category}
                      <span className="ml-3 text-lg text-gray-300">
                      ({pos.count} mentions)
                      </span>
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-lg text-gray-400">
                  No positive feedback.
                </p>
              )}
            </div>
            {/* Top Negative Categories */}
            <div>
              <h4 className="text-xl font-semibold text-red-400 mb-3">
                Top 3 Critical Feedback
              </h4>
              {item.top_negative.length > 0 ? (
                item.top_negative.map((neg, i) => (
                  <div
                    key={i}
                    className="p-4 mb-3 bg-red-500/5 rounded-lg border border-red-500/10"
                  >
                    <p className="text-2xl text-white font-bold">
                      {neg.category}
                      <span className="ml-3 text-lg text-gray-300">
                      ({neg.count} mentions)
                      </span>
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-lg text-gray-400">
                  No negative feedback.
                </p>
              )}
            </div>
          </div>
        </div>
      ))}

      {sortedData.length > 12 && (
        <div className="text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-4 py-2 bg-white/10 rounded-lg text-gray-300 hover:bg-white/20 transition"
          >
            {showAll ? "Show Fewer Months" : "Show Older Months"}
          </button>
        </div>
      )}
    </div>
  );
}

console.log("Shopify data:", shopifyData);


const StatsOverview = ({ overallData }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Positive Sentiment */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-green-500/10 rounded-lg">
            <ThumbsUp className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Positive
            </h3>
            <p className="text-3xl font-extrabold text-white">
              {overallData.overall_sentiment.positive.toFixed(1)}%
            </p>
            <p className="text-lg font-bold text-gray-300">
              {overallData.sentiment_counts.positive.toLocaleString()} reviews
            </p>
          </div>
        </div>
      </div>

      {/* Negative Sentiment */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-500/10 rounded-lg">
            <ThumbsDown className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Negative
            </h3>
            <p className="text-3xl font-extrabold text-white">
              {overallData.overall_sentiment.negative.toFixed(1)}%
            </p>
            <p className="text-lg font-bold text-gray-300">
              {overallData.sentiment_counts.negative.toLocaleString()} reviews
            </p>
          </div>
        </div>
      </div>

      {/* Neutral Sentiment */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gray-500/10 rounded-lg">
            <Minus className="w-6 h-6 text-gray-500" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Neutral
            </h3>
            <p className="text-3xl font-extrabold text-white">
              {overallData.overall_sentiment.neutral.toFixed(1)}%
            </p>
            <p className="text-lg font-bold text-gray-300">
              {overallData.sentiment_counts.neutral.toLocaleString()} reviews
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};



  const renderContent = () => {
    return (
      <>

{(activeTab === 'overview' || activeTab === 'categories') && (
  <EmotionalStats
    emotionalData={emotionalData}
    onEmotionClick={handleEmotionClick}
  />
  
)}

{activeTab === 'monthlyReport' && (
  <>
  <MonthlyReportView
    API_BASE_URL={API_BASE_URL}           // pass your old code’s API_BASE_URL
    selectedCompany={selectedCompany}     // or however you track the selected company
  />
  </>
)}


{activeTab === 'shopify' && (
  <div className="space-y-8">
    <h2 className="text-2xl font-bold text-white mb-6">
      Shopify Analytics Overview
    </h2>
    
    {/* Change md:grid-cols-3 to md:grid-cols-4 */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* Total Gross Sales */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-green-500/10 rounded-lg">
            <DollarSign className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Total Gross Sales
            </h3>
            <p className="text-3xl font-extrabold text-white">
              €{shopifyData?.total_gross_sales.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Total Customers */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-lg">
            <Users className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Total Customers
            </h3>
            <p className="text-3xl font-extrabold text-white">
              {shopifyData?.total_customers.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Avg Order Value */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-500/10 rounded-lg">
            <TrendingUp className="w-6 h-6 text-purple-500" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Avg Order Value
            </h3>
            <p className="text-3xl font-extrabold text-white">
              €
              {shopifyData &&
                (shopifyData.total_gross_sales / shopifyData.total_customers).toLocaleString(
                  undefined,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                )}
            </p>
          </div>
        </div>
      </div>

      {/* NEW: Total Orders */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
  <div className="flex items-center gap-4">
    <div className="p-3 bg-indigo-500/10 rounded-lg">
      <ShoppingBag className="w-6 h-6 text-indigo-500" />
    </div>
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        Total Orders
      </h3>
      <p className="text-3xl font-extrabold text-white">
        {shopifyData?.total_orders?.toLocaleString()}
      </p>
    </div>
  </div>
</div>

    </div>
  
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
  <h3 className="text-xl font-semibold mb-6">Best Selling Products</h3>
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
    {shopifyData?.best_selling_products?.map((item, index) => (
      <div
        key={index}
        className="relative p-6 rounded-lg border border-white/20
                   bg-gradient-to-br from-gray-800 to-gray-900
                   hover:from-gray-700 hover:to-gray-800 transition
                   shadow-lg hover:shadow-2xl hover:scale-[1.02]"
      >
        {/* Rank Badge (optional) */}
        <span className="absolute top-2 right-2 text-lg font-extrabold text-white">
  #{index + 1}
</span>


        <h4 className="text-xl font-bold text-white mb-2">{item.product}</h4>

        {/* "Top Seller" label with a star icon (optional) */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Star className="w-4 h-4 text-yellow-400" />
          <span>Top Seller</span>
        </div>

        <div className="flex items-center justify-between">
          {/* Quantity Sold */}
          <div>
            <p className="text-sm text-gray-400">Quantity Sold</p>
            <p className="text-lg font-semibold text-gray-100">
              {item.quantity_sold}
            </p>
          </div>

          <div className="border-l border-white/10 h-10 mx-4" />

          {/* Revenue */}
          <div>
            <p className="text-sm text-gray-400">Revenue</p>
            <p className="text-lg font-semibold text-green-400">
              €{item.revenue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </p>
          </div>
        </div>
      </div>
    ))}
  </div>
</div>
        </div>
      )}

      {issueModalOpen && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-gray-900 p-6 rounded-lg max-w-2xl w-full border border-white/10">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">Issue Details</h2>
        <button
          className="text-gray-400 hover:text-white"
          onClick={() => setIssueModalOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4 max-h-96 overflow-auto">
        {selectedIssueReviews.map((rev) => (
          <div key={rev._id} className="p-4 bg-white/5 rounded-lg border border-white/10">
            <p className="text-sm text-gray-300 mb-1">
              <span className="font-semibold text-white">Created:</span>{" "}
              {rev.time_period}
            </p>
            <p className="text-sm text-gray-300 mb-1">
              <span className="font-semibold text-white">AI Summary:</span>{" "}
              {rev.overall_summary}
            </p>
            <p className="text-sm text-gray-300 mb-1">
              <span className="font-semibold text-white">Sentiment Detail:</span>{" "}
              {rev.overall_sentiment_detail}
            </p>
            {/* Add more fields as needed */}
          </div>
        ))}
      </div>
    </div>
  </div>
)}

{showSubCategoryModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-gray-900 p-6 rounded-lg max-w-md w-full border border-white/10">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">
          {parentCategoryClicked} - Subcategories
        </h2>
        <button onClick={() => setShowSubCategoryModal(false)}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="space-y-3">
        {subCategories.map((sub, index) => (
          <button
            key={index}
            onClick={() => {
              setShowSubCategoryModal(false);
              handleIssueClick(sub.category, parentSentiment || "positive");
            }}
            className="p-3 bg-white/5 rounded-lg text-left w-full hover:bg-white/10 transition"
          >
            <p className="text-gray-300">{sub.category}</p>
            <p className="text-sm text-gray-500">Frequency: {sub.count} mentions</p>
          </button>
        ))}
      </div>
    </div>
  </div>
)}

{activeTab === 'monthlyFeedback' && (
  <MonthlyFeedbackCards data={monthlyFeedback} />
)}



  


      {activeTab === 'categories' && (
        <div className="space-y-6">
          {/* Category Analysis Section goes here */}
        </div>
      )}


      {/* Conditionally render the detail card if an emotion is selected */}
      {categoryDetails && selectedEmotion && (
    <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          Details for: {selectedEmotion}
        </h3>
        <button
          onClick={() => {
            setCategoryDetails(null);
            setSelectedEmotion(null);
          }}
          className="text-gray-400 hover:text-white"
        >
          Close
        </button>
      </div>
      {/* Categories */}
      <div>
        <h4 className="text-md font-medium mb-2">Categories:</h4>
        {categoryDetails.categories.map((cat) => (
          <p key={cat} className="text-sm text-gray-300">
            {cat}
          </p>
        ))}
      </div>
      {/* Overall Sentimental Categories */}
      {/* <div className="mt-4">
        <h4 className="text-md font-medium mb-2">Overall Sentimental Categories:</h4>
        {categoryDetails.overall_sentimental_categories.map((osc) => (
          <p key={osc} className="text-sm text-gray-300">
            {osc}
          </p>
        ))}
      </div> */}
      {/* NEW: Summary Section */}
      <div className="mt-4">
        <h4 className="text-md font-medium mb-2">Summary:</h4>
        <p className="text-sm text-gray-300">
          {categoryDetails.summary || "No summary available."}
        </p>
      </div>
    </div>
  )}

{activeTab === 'categories' && (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => fetchCategoryAnalysis(category)}
          className={`p-4 rounded-xl border transition-all ${
            selectedCategory === category
              ? 'bg-white/20 border-white/20 text-white'
              : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <ListChecks className="w-5 h-5" />
            <span>{category}</span>
          </div>
        </button>
      ))}
    </div>
    {selectedCategory && <CategoryAnalysisSection />}
  </div>
)}

{activeTab === 'overview' && (
        <>
<div className="grid grid-cols-1 md:grid-cols-1 gap-6 mb-8">
{/* Sentiment Trends */}
<div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 h-96 w-full max-w-full">
  <h2 className="text-xl font-semibold mb-4">Sentiment Trends</h2>
  <ResponsiveContainer width="100%" height={350}>
  <LineChart data={combinedTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
    <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" />
    <YAxis stroke="rgba(255,255,255,0.5)" />
    <Tooltip content={<MonthlyFeedbackTooltip />} />
    <Legend verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: '10px' }} />
    <Line type="monotone" dataKey="positive" stroke="#10B981" strokeWidth={2} dot={false} name="Positive" />
    <Line type="monotone" dataKey="negative" stroke="#EF4444" strokeWidth={2} dot={false} name="Negative" />
    <Line type="monotone" dataKey="neutral" stroke="#6B7280" strokeWidth={2} dot={false} name="Neutral" />
  </LineChart>
</ResponsiveContainer>

</div>


          </div>

            {/* Feedback and Issues */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Top Positive Feedback</h2>
                  <button
                    onClick={() => setShowAllPositive(!showAllPositive)}
                    className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
                  >
                    {showAllPositive ? 'Show Less' : 'View More'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
{/* Top Positive Feedback */}
{/* Top Positive Feedback */}
<div className="space-y-3">
{positiveFeedback.map((item, index) => (
  <button
    key={index}
    onClick={() => handleParentTileClick(item.category, "positive")}
    className="p-3 bg-white/5 rounded-lg text-left w-full hover:bg-white/10 transition"
  >
    <p className="text-gray-300">{item.category}</p>
    <p className="text-sm text-gray-500">Frequency: {item.count} mentions</p>
  </button>
))}


</div>


              </div>
              <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Critical Issues</h2>
                  <button
                    onClick={() => setShowAllNegative(!showAllNegative)}
                    className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
                  >
                    {showAllNegative ? 'Show Less' : 'View More'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
               {/* Critical Issues */}
<div className="space-y-3">
{criticalIssues.map((item, index) => (
  <button
    key={index}
    onClick={() => handleParentTileClick(item.category, "negative")}
    className="p-3 bg-white/5 rounded-lg border-l-2 border-red-500 text-left w-full hover:bg-white/10 transition"
  >
    <p className="text-gray-300">{item.category}</p>
    <p className="text-sm text-gray-500">Frequency: {item.count} mentions</p>
  </button>
))}


</div>

                    


              </div>
            </div>
          </>
        )}

        {activeTab === 'insights' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                <h2 className="text-xl font-semibold mb-4">Top Pros</h2>
                <div className="space-y-3">
                  {prosCons.pros.map((pro, index) => (
                    <div key={index} className="p-3 bg-green-500/5 rounded-lg border border-green-500/10">
                      <p className="text-gray-300">{pro.text}</p>
                      <p className="text-sm text-gray-500">Mentioned {pro.count} times</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
                <h2 className="text-xl font-semibold mb-4">Top Cons</h2>
                <div className="space-y-3">
                  {prosCons.cons.map((con, index) => (
                    <div key={index} className="p-3 bg-red-500/5 rounded-lg border border-red-500/10">
                      <p className="text-gray-300">{con.text}</p>
                      <p className="text-sm text-gray-500">Mentioned {con.count} times</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comparison' && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 h-96">
              <h2 className="text-xl font-semibold mb-4">Platform Comparison</h2>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="platform" stroke="rgba(255,255,255,0.5)" />
                  <YAxis stroke="rgba(255,255,255,0.5)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(0,0,0,0.8)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="positive" fill="#10B981" name="Positive" />
                  <Bar dataKey="negative" fill="#EF4444" name="Negative" />
                  <Bar dataKey="neutral" fill="#6B7280" name="Neutral" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold mb-4">Sentiment Trends Analysis</h2>
              <div className="space-y-8">
                {/* Positive Sentiment Area Chart */}
                <div>
                  <h3 className="text-lg font-medium mb-3 text-green-400">Positive Sentiment Trend</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis 
                          dataKey="month" 
                          stroke="rgba(255,255,255,0.5)"
                          tick={{ fill: 'rgba(255,255,255,0.5)' }}
                        />
                        <YAxis 
                          stroke="rgba(255,255,255,0.5)"
                          tick={{ fill: 'rgba(255,255,255,0.5)' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="positive" 
                          stroke="#10B981" 
                          fillOpacity={1}
                          fill="url(#positiveGradient)"
                        />
                        <ReferenceLine
                          y={positiveAverage}
                          stroke="#10B981"
                          strokeDasharray="5 5"
                          label="Avg Positive"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Negative Sentiment Area Chart */}
                <div>
                  <h3 className="text-lg font-medium mb-3 text-red-400">Negative Sentiment Trend</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis 
                          dataKey="month" 
                          stroke="rgba(255,255,255,0.5)"
                          tick={{ fill: 'rgba(255,255,255,0.5)' }}
                        />
                        <YAxis 
                          stroke="rgba(255,255,255,0.5)"
                          tick={{ fill: 'rgba(255,255,255,0.5)' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="negative" 
                          stroke="#EF4444" 
                          fillOpacity={1}
                          fill="url(#negativeGradient)"
                        />
                        <ReferenceLine
                          y={negativeAverage}
                          stroke="#EF4444"
                          strokeDasharray="5 5"
                          label="Avg Negative"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      {/* Sidebar */}
      <div className="fixed top-0 left-0 h-full w-20 bg-black/50 backdrop-blur-lg border-r border-white/10 flex flex-col items-center py-8 gap-8">
        <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
          <CircleSlash className="w-6 h-6" />
        </div>
        <nav className="flex flex-col gap-4">
        <button
  onClick={() => setActiveTab('overview')}
  title="Overall Sentiment Analysis"
  className={`p-3 rounded-lg transition-colors duration-200 ${
    activeTab === 'overview'
      ? 'bg-white/10 text-white'
      : 'text-gray-400 hover:bg-white/5 hover:text-white'
  }`}
>
  <LineChartIcon className="w-6 h-6" />
</button>

{/* <button
  onClick={() => setActiveTab('insights')}
  title="Pros / Cons"
  className={`p-3 rounded-lg transition-colors duration-200 ${
    activeTab === 'insights'
      ? 'bg-white/10 text-white'
      : 'text-gray-400 hover:bg-white/5 hover:text-white'
  }`}
>
  <PieChartIcon className="w-6 h-6" />
</button> */}

{/* <button
  onClick={() => setActiveTab('comparison')}
  title="Platform Comparison"
  className={`p-3 rounded-lg transition-colors duration-200 ${
    activeTab === 'comparison'
      ? 'bg-white/10 text-white'
      : 'text-gray-400 hover:bg-white/5 hover:text-white'
  }`}
>
  <BarChartIcon className="w-6 h-6" />
</button> */}

<button
  onClick={() => setActiveTab('categories')}
  title="Category Analysis"
  className={`p-3 rounded-lg transition-colors duration-200 ${
    activeTab === 'categories'
      ? 'bg-white/10 text-white'
      : 'text-gray-400 hover:bg-white/5 hover:text-white'
  }`}
>
  <FolderHeart className="w-6 h-6" />
</button>

<button
  onClick={() => setActiveTab('monthlyFeedback')}
  title="Monthly Sementic Analysis"
  className={`p-3 rounded-lg transition-colors duration-200 ${
    activeTab === 'monthlyFeedback'
      ? 'bg-white/10 text-white'
      : 'text-gray-400 hover:bg-white/5 hover:text-white'
  }`}
>
  <ListChecks className="w-6 h-6" />
</button>
<button
    onClick={() => setActiveTab('shopify')}
    title="Shopify Analytics"
    className={`p-3 rounded-lg transition-colors duration-200 ${
      activeTab === 'shopify'
        ? 'bg-white/10 text-white'
        : 'text-gray-400 hover:bg-white/5 hover:text-white'
    }`}
  >
    <ShoppingBag className="w-6 h-6" />
  </button>

  <button
  onClick={() => setActiveTab('monthlyReport')}
  title="Monthly Report"
  className={`p-3 rounded-lg transition-colors duration-200 ${
    activeTab === 'monthlyReport'
      ? 'bg-white/10 text-white'
      : 'text-gray-400 hover:bg-white/5 hover:text-white'
  }`}
>
  <Calendar className="w-6 h-6" />
</button>



        </nav>
      </div>

      {/* Main Content */}
      <div className="ml-20 p-8">
      <header className="mb-8 flex items-center justify-between">

          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Peak by Everest
          </h1>
          <p className="text-gray-400">Real-time customer feedback analysis</p>
        </header>

        {/* Filters */}
        <div className="space-y-4 mb-8">
        <CompanySelector />  

          <PlatformSelector />
          
        </div>





        {activeTab === 'categories' && (
        <h2 className="text-3xl font-bold text-white mb-4">
          General Category Overview Analysis
        </h2>
      )}

        {/* Dynamic Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-xl text-gray-400">Loading...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-xl text-red-400">{error}</div>
          </div>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  );
}

export default App;