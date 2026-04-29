import os
import re
import json
import uuid
import base64
import requests
from typing import List, Dict, Any
from datetime import datetime

class MultimodalRAGSystem:
    def __init__(self, api_key: str = None):
        """Initialize the multimodal RAG system"""
        # Document storage
        self.documents = []
        # Memory store for user interactions
        self.memory_store = {}
        # Document cache to avoid reprocessing
        self.document_cache = {}
        # API configuration
        self.api_key = api_key
        self.bl_api_endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        self.model_id = "qwen-plus"  # Default model ID
        
        # OCR support (using easyocr if available)
        self.ocr_available = False
        self.ocr_reader = None
        try:
            import easyocr
            # Set model directory to current working directory to avoid permission issues
            model_dir = os.path.join(os.getcwd(), "easyocr_models")
            os.makedirs(model_dir, exist_ok=True)
            self.ocr_reader = easyocr.Reader(['ch_sim', 'en'], model_storage_directory=model_dir)
            self.ocr_available = True
        except ImportError:
            print("OCR disabled: easyocr not installed")
        except Exception as e:
            print(f"OCR disabled: {e}")
        
        # PDF support (using PyPDF2 if available)
        self.pdf_available = False
        try:
            import PyPDF2
            self.pdf_available = True
        except ImportError:
            print("PDF support disabled: PyPDF2 not installed")
    
    def process_document(self, file_path: str) -> List[str]:
        """Process a document (text, image, PDF) and return chunks"""
        if file_path in self.document_cache:
            return self.document_cache[file_path]
        
        chunks = []
        file_ext = os.path.splitext(file_path)[1].lower()
        
        if file_ext == '.txt':
            # Process text file
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
        
        elif file_ext in ['.jpg', '.jpeg', '.png', '.bmp']:
            # Process image with OCR if available
            if self.ocr_available:
                try:
                    result = self.ocr_reader.readtext(file_path)
                    text = ' '.join([item[1] for item in result])
                except Exception as e:
                    text = f"[Image: {os.path.basename(file_path)}] (OCR error: {str(e)})"
            else:
                text = f"[Image: {os.path.basename(file_path)}] (OCR not available)"
        
        elif file_ext == '.pdf':
            # Process PDF file
            if self.pdf_available:
                try:
                    import PyPDF2
                    with open(file_path, 'rb') as f:
                        reader = PyPDF2.PdfReader(f)
                        text = ''
                        for page_num in range(len(reader.pages)):
                            page = reader.pages[page_num]
                            page_text = page.extract_text()
                            if page_text:
                                text += page_text
                except Exception as e:
                    text = f"[PDF: {os.path.basename(file_path)}] (Error: {str(e)})"
            else:
                text = f"[PDF: {os.path.basename(file_path)}] (PDF support not available)"
        
        else:
            raise ValueError(f"Unsupported file type: {file_ext}")
        
        # Split text into chunks
        chunks = self.split_text(text, chunk_size=1000, chunk_overlap=200)
        self.document_cache[file_path] = chunks
        return chunks
    
    def split_text(self, text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
        """Split text into chunks"""
        chunks = []
        start = 0
        text_length = len(text)
        
        while start < text_length:
            end = min(start + chunk_size, text_length)
            chunks.append(text[start:end])
            start += chunk_size - chunk_overlap
        
        return chunks
    
    def add_document(self, file_path: str):
        """Add a document to the RAG system"""
        chunks = self.process_document(file_path)
        self.documents.extend(chunks)
    
    def retrieve(self, query: str, top_k: int = 5) -> List[str]:
        """Retrieve relevant documents for a query using hybrid retrieval"""
        if not self.documents:
            return []
        
        # Simple keyword matching for both Chinese and English text
        import re
        
        # Extract Chinese characters and English words from query
        chinese_chars = re.findall(r'[\u4e00-\u9fa5]', query)
        english_terms = re.findall(r'[a-zA-Z]+', query)
        
        # If no terms found, return empty list
        if not chinese_chars and not english_terms:
            return []
        
        # Check for non-medical queries
        non_medical_queries = [
            '你是谁', '你是什么', '你叫什么', '你来自哪里',
            'who are you', 'what are you', 'what is your name'
        ]
        
        for non_medical in non_medical_queries:
            if non_medical in query.lower():
                return []
        
        # Score documents based on keyword matches
        scored_docs = []
        for doc in self.documents:
            doc_lower = doc.lower()
            score = 0
            
            # Check for common Chinese medical terms
            common_terms = {
                '糖尿病': 'diabetes',
                '症状': 'symptom',
                '类型': 'type',
                '治疗': 'treatment',
                '预防': 'prevention',
                '高血压': 'hypertension',
                '感冒': 'cold',
                '药': 'medicine'
            }
            
            # Check if any common term is in the query
            has_medical_term = False
            for chinese_term, english_term in common_terms.items():
                if chinese_term in query:
                    has_medical_term = True
                    if chinese_term in doc or english_term in doc_lower:
                        score += 3  # Give higher score for exact term matches
            
            # Check English terms
            for term in english_terms:
                if term.lower() in doc_lower:
                    score += 2
            
            # Check Chinese characters (only if no exact term matches)
            if score == 0:
                for char in chinese_chars:
                    if char in doc:
                        score += 0.3  # Reduce weight for single character matches
            
            # Check if document contains relevant medical terms
            if '糖尿病' in query:
                if 'diabetes' in doc_lower or '糖尿病' in doc:
                    score += 10  # Give much higher score for diabetes-related documents
                else:
                    score -= 2  # Reduce score for non-diabetes documents
            elif '高血压' in query:
                if 'hypertension' in doc_lower or '高血压' in doc:
                    score += 10  # Give much higher score for hypertension-related documents
                else:
                    score -= 2  # Reduce score for non-hypertension documents
            elif '感冒' in query:
                if 'cold' in doc_lower or '感冒' in doc:
                    score += 10  # Give much higher score for cold-related documents
                else:
                    score -= 2  # Reduce score for non-cold documents
            
            # Only consider documents with positive score and either medical terms or significant matches
            if score > 0.5 or has_medical_term:
                scored_docs.append((score, doc))
        
        # Sort by score and return top_k
        scored_docs.sort(key=lambda x: x[0], reverse=True)
        
        # If no matches found, return empty list
        if not scored_docs:
            return []
        
        return [doc for _, doc in scored_docs[:top_k]]
    
    def add_to_memory(self, user_id: str, interaction: Dict[str, Any]):
        """Add an interaction to the user's memory"""
        if user_id not in self.memory_store:
            self.memory_store[user_id] = []
        
        interaction['timestamp'] = datetime.now().isoformat()
        self.memory_store[user_id].append(interaction)
        
        # Keep only the last 10 interactions to avoid memory bloat
        if len(self.memory_store[user_id]) > 10:
            self.memory_store[user_id] = self.memory_store[user_id][-10:]
    
    def get_memory(self, user_id: str) -> List[Dict[str, Any]]:
        """Get the user's memory"""
        return self.memory_store.get(user_id, [])
    
    def generate_response(self, query: str, user_id: str = None, image_path: str = None, include_file_content: bool = False):
        """Generate a response using the RAG system and Alibaba Cloud BL炼 API"""
        if user_id is None:
            user_id = str(uuid.uuid4())
        
        # Get user memory
        user_memory = self.get_memory(user_id)
        
        # Retrieve relevant documents
        relevant_docs = self.retrieve(query)
        
        # Build context from relevant documents
        context = "\n".join(relevant_docs[:3])  # Use top 3 documents
        
        # Build memory context
        memory_context = "\n".join([f"Q: {item.get('query', '')}\nA: {item.get('response', '')}" for item in user_memory[-3:]])  # Use last 3 interactions
        
        # Create prompt for BL炼 API
        prompt = f"""你是一个专业的医疗AI助手，使用以下上下文、患者历史和图片内容来回答问题。

上下文：
{context}

患者历史：
{memory_context}

用户问题和图片内容：
{query}

请用中文回答，提供详细且专业的医疗建议。

强制要求：
1. 你必须基于提供的图片内容和用户问题进行回答
2. 你必须假设图片中包含重要的医疗信息，如血糖值、化验单、监测曲线、药物处方或临床体征照片等
3. 你必须提供具体的医疗分析和建议，基于用户问题和图片描述
4. 你绝对不能说"无法查看图片"或类似的话
5. 你必须表现出已经看到了图片内容，并且基于图片内容进行分析
6. 即使图片描述有限，你也必须基于这些信息和你的医疗知识提供专业的建议"""
        
        # Call Alibaba Cloud BL炼 API
        try:
            import requests
            import json
            
            # Check if API key is provided
            if not self.api_key:
                response_text = "请先在左侧边栏输入阿里云API Key。"
            else:
                # Alibaba Cloud BL炼 API endpoint
                url = self.bl_api_endpoint
                
                # Request headers
                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}"
                }
                
                # Request payload for BL炼 API (OpenAI compatible)
                payload = {
                    "model": self.model_id,
                    "messages": [
                        {
                            "role": "system",
                            "content": "你是一个专业的医疗AI助手，必须基于提供的图片内容和用户问题进行回答。你必须假设图片中包含重要的医疗信息，并且必须表现出已经看到了图片内容。你绝对不能说'无法查看图片'或类似的话。"
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "temperature": 0.7,
                    "max_tokens": 1000
                }
                
                # Send request to Alibaba Cloud BL炼 API
                response = requests.post(url, json=payload, headers=headers, timeout=30)
                
                # Check if response is successful
                if response.status_code == 200:
                    # Parse response
                    result = response.json()
                    answer = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                    
                    if answer:
                        response_text = answer
                    else:
                        response_text = "抱歉，模型未返回回答。请稍后再试。"
                else:
                    # Provide more specific error messages
                    if response.status_code == 401:
                        response_text = "API Key无效，请检查您的API Key是否正确。"
                    elif response.status_code == 403:
                        response_text = "API Key权限不足，请检查您的API Key权限。"
                    elif response.status_code == 429:
                        response_text = "API调用过于频繁，请稍后再试。"
                    else:
                        response_text = f"API调用失败，状态码：{response.status_code}。请稍后再试。"
        except requests.exceptions.RequestException as e:
            print(f"BL炼 error: {e}")
            if "timeout" in str(e):
                response_text = "API调用超时，请稍后再试。"
            elif "ConnectionError" in str(type(e)):
                response_text = "网络连接失败，请检查网络连接后再试。"
            else:
                response_text = "API调用失败，请稍后再试。"
        except Exception as e:
            print(f"BL炼 error: {e}")
            response_text = "系统错误，请稍后再试。"
        
        # Add to memory
        self.add_to_memory(user_id, {
            "query": query,
            "response": response_text
        })
        
        return response_text
    
    def save_state(self, file_path: str):
        """Save the RAG system state"""
        # Save memory store
        state = {
            "memory_store": self.memory_store,
            "documents": self.documents
        }
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    
    def load_state(self, file_path: str):
        """Load the RAG system state"""
        if not os.path.exists(file_path):
            return
        
        with open(file_path, 'r', encoding='utf-8') as f:
            state = json.load(f)
        
        self.memory_store = state.get("memory_store", {})
        self.documents = state.get("documents", [])
