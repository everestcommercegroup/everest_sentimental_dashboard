import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { LineChart as LineChartIcon, BarChart as BarChartIcon, CircleSlash, AlertTriangle, ThumbsUp, ThumbsDown, Minus, ChevronRight, PieChart as PieChartIcon, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Area, AreaChart } from 'recharts';
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

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [timeFilter, setTimeFilter] = useState('30');
  const [overallData, setOverallData] = useState<OverallReport>({
    overall_sentiment: { positive: 0, negative: 0, neutral: 0 },
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

  const API_BASE_URL = 'https://everest-sentimental-dashboard-backend.onrender.com';

  const processFeedbackData = useCallback((data: unknown): TopFeedback[] => {
    if (!Array.isArray(data)) return [];
    
    return data.map(item => ({
      category: safeString((item as any)?.category),
      count: safeNumber((item as any)?.count)
    })).filter(item => item.category && item.count > 0);
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
        trendRes,
        positiveRes,
        negativeRes,
        comparisonRes,
        prosConsRes,
        riskAlertsRes
      ] = await Promise.all([
        axios.get(`${API_BASE_URL}/report/overall_by_platform`, { params })
          .catch(() => ({ data: null })),
        axios.get(`${API_BASE_URL}/report/trends`, { params })
          .catch(() => ({ data: { trends: [] } })),
        axios.get(`${API_BASE_URL}/report/category_table`, {
          params: { ...params, sentiment: 'positive', limit: showAllPositive ? 10 : 3 }
        }).catch(() => ({ data: { table: [] } })),
        axios.get(`${API_BASE_URL}/report/category_table`, {
          params: { ...params, sentiment: 'negative', limit: showAllNegative ? 10 : 3 }
        }).catch(() => ({ data: { table: [] } })),
        axios.get(`${API_BASE_URL}/report/platform_comparison`)
          .catch(() => ({ data: { platforms: [] } })),
        axios.get(`${API_BASE_URL}/report/pros_cons`, { params })
          .catch(() => ({ data: { pros: [], cons: [] } })),
        axios.get(`${API_BASE_URL}/report/risk_alerts`, { params })
          .catch(() => ({ data: { alerts: [] } }))
      ]);

      setOverallData(processOverallData(overallRes.data));
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

  const renderContent = () => {
    switch (activeTab) {
      case 'insights':
        return (
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
        );

      case 'comparison':
        return (
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
        );

      case 'alerts':
        return (
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
                        {/* Average line */}
                        <Line
                          type="monotone"
                          dataKey={() => {
                            const avg = trendData.reduce((sum, item) => sum + item.positive, 0) / trendData.length;
                            return avg;
                          }}
                          stroke="#10B981"
                          strokeDasharray="5 5"
                          name="Average"
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
                        {/* Average line */}
                        <Line
                          type="monotone"
                          dataKey={() => {
                            const avg = trendData.reduce((sum, item) => sum + item.negative, 0) / trendData.length;
                            return avg;
                          }}
                          stroke="#EF4444"
                          strokeDasharray="5 5"
                          name="Average"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Sentiment Distribution */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 h-80">
                <h2 className="text-xl font-semibold mb-4">Sentiment Distribution</h2>
                <ResponsivePie
                  data={pieChartData}
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                  innerRadius={0.6}
                  padAngle={0.7}
                  cornerRadius={3}
                  activeOuterRadiusOffset={8}
                  colors={{ datum: 'data.color' }}
                  borderWidth={1}
                  borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                  arcLinkLabelsSkipAngle={10}
                  arcLinkLabelsTextColor="rgba(255,255,255,0.8)"
                  arcLinkLabelsThickness={2}
                  arcLinkLabelsColor={{ from: 'color' }}
                  arcLabelsSkipAngle={10}
                  arcLabelsTextColor="rgba(255,255,255,0.8)"
                  theme={{
                    background: 'transparent',
                    textColor: 'rgba(255,255,255,0.8)',
                    fontSize: 12,
                    axis: {
                      domain: {
                        line: {
                          stroke: 'rgba(255,255,255,0.1)',
                        },
                      },
                    },
                    grid: {
                      line: {
                        stroke: 'rgba(255,255,255,0.1)',
                      },
                    },
                  }}
                />
              </div>

              {/* Sentiment Trends */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10 h-80">
                <h2 className="text-xl font-semibold mb-4">Sentiment Trends</h2>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px'
                      }}
                    />
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
        );
    }
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
        </nav>
      </div>

      {/* Main Content */}
      <div className="ml-20 p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Sentiment Analysis Dashboard
          </h1>
          <p className="text-gray-400">Real-time customer feedback analysis</p>
        </header>

        {/* Filters */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-4">
            <Clock className="w-5 h-5 text-gray-400" />
            <div className="flex gap-2">
              {['7', '30', '60'].map((days) => (
                <button
                  key={days}
                  onClick={() => setTimeFilter(days)}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    timeFilter === days
                      ? 'bg-white/20 text-white'
                      : 'hover:bg-white/10 text-gray-400'
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>
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
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
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
