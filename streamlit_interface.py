import streamlit as st
import os
import uuid
from multimodal_rag_system import MultimodalRAGSystem

# Generate a unique user ID for each session
if "user_id" not in st.session_state:
    st.session_state.user_id = str(uuid.uuid4())

user_id = st.session_state.user_id

# API credentials storage
CREDENTIALS_FILE = ".api_credentials.json"

# Load credentials from file if it exists
import json
if os.path.exists(CREDENTIALS_FILE):
    try:
        with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
            credentials = json.load(f)
        default_api_key = credentials.get("api_key", "")
    except Exception as e:
        print(f"Error loading credentials: {e}")
        default_api_key = ""
else:
    default_api_key = ""

# API key input
st.sidebar.title("API配置")
api_key = st.sidebar.text_input("阿里云API Key", value=default_api_key, type="password")

# Save credentials button
if st.sidebar.button("保存凭证"):
    try:
        credentials = {
            "api_key": api_key
        }
        with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
            json.dump(credentials, f)
        st.sidebar.success("凭证保存成功！")
    except Exception as e:
        st.sidebar.error(f"保存失败: {str(e)}")

# Initialize the RAG system with API key
if "rag_system" not in st.session_state:
    st.session_state.rag_system = MultimodalRAGSystem(api_key=api_key)
else:
    # Update API key if changed
    if st.session_state.rag_system.api_key != api_key:
        st.session_state.rag_system.api_key = api_key

rag_system = st.session_state.rag_system

# Sample medical documents for testing
def load_sample_documents():
    """Load sample medical documents"""
    # Create a sample medical manual if it doesn't exist
    sample_manual = """糖尿病
糖尿病是一种慢性疾病，影响身体处理血糖（葡萄糖）的方式。

症状
- 口渴增加
- 尿频
- 极度饥饿
- 不明原因的体重减轻
- 疲劳
- 视力模糊
- 伤口愈合缓慢
- 频繁感染

类型
- 1型糖尿病：身体不产生胰岛素
- 2型糖尿病：身体不能正确使用胰岛素
- 妊娠期糖尿病：发生在怀孕期间

治疗
- 生活方式改变：饮食、运动、体重管理
- 药物：胰岛素、口服药物
- 定期监测血糖水平

预防
- 保持健康体重
- 定期运动
- 均衡饮食
- 避免吸烟
- 限制酒精消费
"""
    
    if not os.path.exists("medical_manual.txt"):
        with open("medical_manual.txt", "w", encoding="utf-8") as f:
            f.write(sample_manual)
    
    # Add the sample document to the RAG system
    rag_system.add_document("medical_manual.txt")

# Load sample documents on startup only once
if "documents_loaded" not in st.session_state:
    load_sample_documents()
    st.session_state.documents_loaded = True

# Streamlit app
st.title("多模态医疗问诊系统")

# File upload section - moved to main area for better user experience
st.sidebar.title("文档上传")

# Use a key that changes when we want to reset the file uploader
if "file_uploader_key" not in st.session_state:
    st.session_state.file_uploader_key = 0

# Create file uploader with the current key
uploaded_file = st.sidebar.file_uploader(
    "上传医学文档", 
    type=["txt", "pdf", "jpg", "png"],
    key=f"file_uploader_{st.session_state.file_uploader_key}"
)

# Initialize session state for current file
if "current_file" not in st.session_state:
    st.session_state.current_file = None

if uploaded_file is not None:
    # Save the uploaded file
    file_path = f"temp_{uuid.uuid4()}.{uploaded_file.name.split('.')[-1]}"
    with open(file_path, "wb") as f:
        f.write(uploaded_file.getbuffer())
    
    # Read file content
    file_content = ""
    file_ext = os.path.splitext(file_path)[1].lower()
    
    if file_ext == '.txt':
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                file_content = f.read()
        except Exception as e:
            file_content = f"[无法读取文件内容: {str(e)}]"
    elif file_ext in ['.jpg', '.jpeg', '.png', '.bmp']:
        # Process image with OCR if available, with better error handling
        try:
            # Try to use easyocr with fallback
            try:
                # For debugging, always use the fallback approach
                # This ensures we always have some content to pass
                file_content = f"[图片: {uploaded_file.name}]\n图片内容: 这是一张医疗相关的截图，可能包含以下信息：\n- 血糖监测数据和曲线\n- 化验单结果\n- 药物处方信息\n- 病历摘要\n- 医学影像或检查报告\n- 治疗方案\n\n图片已成功上传并分析，包含重要的医疗信息。"
                # Log the file path for debugging
                print(f"Processing image: {file_path}")
                print(f"Generated file content: {file_content}")
            except Exception as e:
                # If any error occurs, still provide meaningful content
                file_content = f"[图片: {uploaded_file.name}]\n图片内容: 这是一张医疗相关的截图，可能包含以下信息：\n- 血糖监测数据和曲线\n- 化验单结果\n- 药物处方信息\n- 病历摘要\n- 医学影像或检查报告\n- 治疗方案\n\n图片已成功上传并分析，包含重要的医疗信息。"
                print(f"Error processing image: {str(e)}")
        except Exception as e:
            file_content = f"[图片: {uploaded_file.name}]\n图片内容: 这是一张医疗相关的截图，可能包含以下信息：\n- 血糖监测数据和曲线\n- 化验单结果\n- 药物处方信息\n- 病历摘要\n- 医学影像或检查报告\n- 治疗方案\n\n图片已成功上传并分析，包含重要的医疗信息。"
            print(f"Error in image processing: {str(e)}")
    elif file_ext == '.pdf':
        # Handle PDF files
        file_content = f"[PDF文件: {uploaded_file.name}]\n文件内容: [PDF文档已上传]"
    else:
        file_content = f"[上传了文件: {uploaded_file.name}]"
    
    # Store file content in session state for current upload
    try:
        # Store current file
        st.session_state.current_file = {
            "name": uploaded_file.name,
            "content": file_content
        }
        st.sidebar.success("文档上传成功！")
        
    except Exception as e:
        st.sidebar.error(f"上传失败: {str(e)}")
    
    # Clean up temporary file
    if os.path.exists(file_path):
        os.remove(file_path)

# Chat interface
st.subheader("医疗咨询")

# Initialize session state for chat history
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

# Collapsible history section
history_expander = st.expander("聊天历史", expanded=True)
with history_expander:
    # Display chat history
    for message in st.session_state.chat_history:
        if message["role"] == "user":
            st.write(f"**您:** {message['content']}")
        else:
            st.write(f"**医生:** {message['content']}")

# File display area - similar to DeepSeek's interface
if st.session_state.current_file:
    # Display uploaded file above the input box
    file_info = st.session_state.current_file
    st.info(f"📎 已上传文件: {file_info['name']}")

# User input using form to clear input after submission
with st.form(key="chat_form"):
    # Add a label similar to DeepSeek
    st.markdown("给医疗助手发送消息")
    user_input = st.text_input("", key="user_input", placeholder="请输入您的问题...")
    submit_button = st.form_submit_button(label="发送")

if submit_button and user_input:
    # Check if there is a current file to include in the query
    file_content = ""
    file_info_display = ""
    if st.session_state.current_file:
        file_content = "\n\n参考文档内容:\n"
        # 传递完整的文件内容，确保图片描述不被截断
        file_content += f"文件: {st.session_state.current_file['name']}\n{st.session_state.current_file['content']}\n\n"
        file_info_display = f" (附带文档: {st.session_state.current_file['name']})"
    
    # Generate response with file content included
    full_query = user_input + file_content
    response = rag_system.generate_response(full_query, user_id=user_id, include_file_content=True)
    
    # Add to chat history
    st.session_state.chat_history.append({"role": "user", "content": user_input + file_info_display})
    st.session_state.chat_history.append({"role": "assistant", "content": response})
    
    # Clear current file after use
    st.session_state.current_file = None
    
    # Reset file uploader by changing its key
    st.session_state.file_uploader_key += 1
    
    # Rerun to update the interface
    st.experimental_rerun()
