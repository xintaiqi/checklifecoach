/**
 * 生命教练AI聊天服务器
 * 使用Express框架构建的RESTful API服务
 * 提供与火山方舟AI模型的对话能力
 */

// 导入必要的依赖包
const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// 创建Express应用实例
const app = express();
const port = process.env.PORT || 3000;

// 配置中间件
// 启用CORS跨域支持
app.use(cors());
// 解析JSON请求体
app.use(express.json());
// 配置静态文件服务，支持前端资源访问
app.use(express.static('.'));

// 导入dotenv配置环境变量（仅在开发环境中加载.env文件）
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

// API配置
const API_KEY = process.env.API_KEY;
const API_URL = process.env.API_URL;

// 验证环境变量
if (!API_KEY || !API_URL) {
    console.error('错误：缺少必要的环境变量配置');
    process.exit(1);
}

// 错误处理中间件
const errorHandler = (err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        error: '服务器内部错误',
        message: err.message
    });
};

/**
 * 处理聊天请求的路由
 * @param {Object} req - 包含messages和temperature参数的请求对象
 * @param {Object} res - 用于返回流式响应的响应对象
 */
app.post('/chat', async (req, res) => {
    try {
        const { messages, temperature = 0.7 } = req.body;

        // 配置API请求参数
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        };

        const requestBody = {
            model: 'deepseek-r1-250120',
            messages: messages,
            temperature: temperature,
            stream: true // 启用流式响应
        };

        // 设置请求超时保护
        const TIMEOUT_MS = 60000; // 60秒超时
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        // 发送请求到火山方舟API
        let response;
        try {
            response = await fetch(API_URL, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
        } catch (error) {
            clearTimeout(timeout);
            if (error.name === 'AbortError') {
                throw new Error('请求超时，请稍后重试');
            }
            throw error;
        }

        // 清除超时计时器
        clearTimeout(timeout);

        // 检查响应状态
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }

        // 设置响应头以支持流式输出
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 处理流式响应
        try {
            for await (const chunk of response.body) {
                const text = chunk.toString('utf8');
                const lines = text.split('\n').filter(line => line.trim() !== '');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            continue;
                        }
                        try {
                            const jsonData = JSON.parse(data);
                            if (jsonData?.choices?.[0]?.delta?.content) {
                                let content = jsonData.choices[0].delta.content;
                                // 移除markdown格式标记，优化输出内容
                                content = content
                                    .replace(/```[\s\S]*?```/g, '') // 移除代码块
                                    .replace(/`([^`]+)`/g, '$1') // 移除行内代码
                                    .replace(/\*\*([^*]+)\*\*/g, '$1') // 移除加粗
                                    .replace(/\*([^*]+)\*/g, '$1') // 移除斜体
                                    .replace(/^#+\s/gm, '') // 移除标题标记
                                    .replace(/^[\-\*]\s/gm, '') // 移除列表标记
                                    .trim(); // 移除首尾空白字符

                                if (content) {
                                    res.write(content);
                                }
                            }
                        } catch (jsonError) {
                            console.error('JSON解析错误:', jsonError, '原始数据:', data);
                            continue;
                        }
                    }
                }
            }
            res.end();
        } catch (streamError) {
            console.error('流处理错误:', streamError);
            throw streamError;
        }
    } catch (error) {
        console.error('处理请求错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 注册错误处理中间件
app.use(errorHandler);

// 启动服务器
app.listen(port, () => {
    console.log(`生命教练AI服务器已启动: http://localhost:${port}`);
    console.log('按 Ctrl+C 停止服务器');
});