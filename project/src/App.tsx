import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  X,
  LineChart as LineChartIcon,
  BarChart as BarChartIcon,
  CircleSlash,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Minus,
  ChevronRight,
  FolderHeart,
  PieChart as PieChartIcon,
  CheckCircle2,
  XCircle,
  Tag,
  ListChecks,
  ChevronDown
} from 'lucide-react';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Area, AreaChart, ReferenceLine, Cell, PieChart, Pie } from 'recharts';
import { ResponsivePie } from '@nivo/pie';
import { safeNumber, safeString, createSafeObject, createPieData } from './utils/chart-helpers';

// Types
interface OverallReport {
  overall_sentiment: {
    positive: number;
    negative: number;
    neutral: number;
  };
  total_reviews: number;
  last_updated: string;
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

function App() {


  const [selectedCompany, setSelectedCompany] = useState<string>('cook_and_pan');

  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [categoryDetails, setCategoryDetails] = useState<DetailCategory | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [timeFilter, setTimeFilter] = useState('30');
  const [overallData, setOverallData] = useState<OverallReport>({
    overall_sentiment: { positive: 0, negative: 0, neutral: 0 },
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

  const fetchCategoryAnalysis = useCallback(async (category: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/report/category_analysis`, {
        params: { category, company: selectedCompany }  // <-- Add company here

      });
      setCategoryAnalysis(response.data);
      setSelectedCategory(category);
    } catch (err) {
      console.error('Error fetching category analysis:', err);
      setError('Failed to fetch category analysis');
    }
  }, [API_BASE_URL]);
  

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
        days: timeFilter,
        platform: selectedPlatform !== 'all' ? selectedPlatform : undefined
      };

      const [
        overallRes,
        emotionalRes,
        trendRes,
        positiveRes,
        negativeRes,
        comparisonRes,
        prosConsRes,
        riskAlertsRes
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
          .catch(() => ({ data: { alerts: [] } }))
      ]);

      setOverallData(processOverallData(overallRes.data));
      setEmotionalData(processEmotionalData(emotionalRes.data));
      setTrendData(processTrendData(trendRes.data?.trends));
      setPositiveFeedback(processFeedbackData(positiveRes.data?.table));
      setCriticalIssues(processFeedbackData(negativeRes.data?.table));
      setComparisonData(processComparisonData(comparisonRes.data?.platforms));
      setProsCons(createSafeObject(prosConsRes.data, { pros: [], cons: [] }));
      setRiskAlerts(riskAlertsRes.data?.alerts || []);

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
    processOverallData,
    processEmotionalData,
    processTrendData,
    processFeedbackData,
    processComparisonData
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
              <ResponsiveContainer width="100%" height="100%">
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
        days: timeFilter,
        platform: selectedPlatform !== 'all' ? selectedPlatform : undefined,
        company: selectedCompany,
      };
      // Call the new backend endpoint /report/detail_categories
      const response = await axios.get<DetailCategoryReport>(`${API_BASE_URL}/report/detail_categories`, { params });
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
  }, [timeFilter, selectedPlatform]);

  const handleEmotionClick = useCallback((emotion: string) => {
    fetchCategoryDetails(emotion);
  }, [fetchCategoryDetails]);


  // Add this new component definition to replace the pie chart
function EmotionalStats({ emotionalData, onEmotionClick }: { emotionalData: OverallDetailReport; onEmotionClick: (emotion: string) => void }) {
    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Emotional Analysis</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(emotionColors).map(([emotion, color]) => {
            // Use 0 if the API doesn't return a value for that emotion
            const value = emotionalData.overall_sentiment_detail[emotion] || 0;
            return (
              <div
                key={emotion}
                className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 hover:bg-white/10 transition-all group cursor-pointer"
                style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
                onClick={() => onEmotionClick(emotion)} // <-- new onClick handler
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-medium capitalize text-gray-400">
                    {emotion}
                  </h3>
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold">{value.toFixed(1)}%</p>
                  <div className="h-1 flex-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${value}%`,
                        backgroundColor: color,
                        opacity: 0.5,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  
  const renderContent = () => {
    return (
      <>
              {/* <EmotionalStats
        emotionalData={emotionalData}
        onEmotionClick={handleEmotionClick}
      /> */}
      {activeTab !== 'categories' && (
        <>
          <EmotionalStats
            emotionalData={emotionalData}
            onEmotionClick={handleEmotionClick}
          />
          <div className="space-y-4 mb-8">
            <PlatformSelector />
          </div>
        </>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Sentiment Trends */}
            <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 h-80">
              <h2 className="text-xl font-semibold mb-4">Sentiment Trends</h2>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" />
                  <YAxis stroke="rgba(255,255,255,0.5)" />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                  <Legend />
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
                <div className="space-y-3">
                  {positiveFeedback.map((item, index) => (
                    <div key={index} className="p-3 bg-white/5 rounded-lg">
                      <p className="text-gray-300">{item.category}</p>
                      <p className="text-sm text-gray-500">Frequency: {item.count} mentions</p>
                    </div>
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
                <div className="space-y-3">
                  {criticalIssues.map((item, index) => (
                    <div key={index} className="p-3 bg-white/5 rounded-lg border-l-2 border-red-500">
                      <p className="text-gray-300">{item.category}</p>
                      <p className="text-sm text-gray-500">Frequency: {item.count} mentions</p>
                    </div>
                    

                    
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
            className={`p-3 rounded-lg transition-all ${
              activeTab === 'overview' ? 'bg-white/10' : 'hover:bg-white/5'
            }`}
          >
            <LineChartIcon className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab('insights')}
            className={`p-3 rounded-lg transition-all ${
              activeTab === 'insights' ? 'bg-white/10' : 'hover:bg-white/5'
            }`}
          >
            <PieChartIcon className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab('comparison')}
            className={`p-3 rounded-lg transition-all ${
              activeTab === 'comparison' ? 'bg-white/10' : 'hover:bg-white/5'
            }`}
          >
            <BarChartIcon className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`p-3 rounded-lg transition-all ${
              activeTab === 'alerts' ? 'bg-white/10' : 'hover:bg-white/5'
            }`}
          >
            <AlertTriangle className="w-6 h-6" />
          </button>

          <button
  onClick={() => setActiveTab('categories')}
  className={`p-3 rounded-lg transition-all ${activeTab === 'categories' ? 'bg-white/10' : 'hover:bg-white/5'}`}
  title="Categories"
>
  <FolderHeart className="w-6 h-6" />
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

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <ThumbsUp className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h3 className="text-sm text-gray-400">Positive</h3>
                <p className="text-2xl font-bold">{overallData.overall_sentiment.positive.toFixed(1)}%</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/10 rounded-lg">
                <ThumbsDown className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm text-gray-400">Negative</h3>
                <p className="text-2xl font-bold">{overallData.overall_sentiment.negative.toFixed(1)}%</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white /10">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gray-500/10 rounded-lg">
                <Minus className="w-6 h-6 text-gray-500" />
              </div>
              <div>
                <h3 className="text-sm text-gray-400">Neutral</h3>
                <p className="text-2xl font-bold">{overallData.overall_sentiment.neutral.toFixed(1)}%</p>
              </div>
            </div>
          </div>
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