# Command-line interface for the multimodal medical consultation system

from multimodal_rag_system import MultimodalRAGSystem
import os
import uuid
import json

# API credentials storage
CREDENTIALS_FILE = ".api_credentials.json"

# Generate a unique user ID for this session
user_id = str(uuid.uuid4())

# Load credentials from file if it exists
def load_credentials():
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading credentials: {e}")
            return {}
    return {}

# Save credentials to file
def save_credentials(credentials):
    try:
        with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
            json.dump(credentials, f)
        return True
    except Exception as e:
        print(f"Error saving credentials: {e}")
        return False

# Load existing credentials
credentials = load_credentials()
if credentials:
    print("检测到已保存的API凭证，是否使用？(y/n)")
    use_saved = input("请输入: ").lower()
    if use_saved == 'y':
        api_key = credentials.get("api_key", "")
        print("使用已保存的凭证")
    else:
        # Get API key from user
        print("请输入阿里云API Key")
        print("====================")
        api_key = input("API Key: ")
        
        # Ask if user wants to save credentials
        print("是否保存凭证到本地？(y/n)")
        save = input("请输入: ").lower()
        if save == 'y':
            save_credentials({"api_key": api_key})
            print("凭证保存成功！")
else:
    # Get API key from user
    print("请输入阿里云API Key")
    print("====================")
    api_key = input("API Key: ")
    
    # Ask if user wants to save credentials
    print("是否保存凭证到本地？(y/n)")
    save = input("请输入: ").lower()
    if save == 'y':
        save_credentials({"api_key": api_key})
        print("凭证保存成功！")

# Initialize the RAG system with API key
rag_system = MultimodalRAGSystem(api_key=api_key)

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

# Load sample documents on startup
load_sample_documents()

def main():
    """Main function for the CLI interface"""
    print("多模态医疗问诊系统 (命令行版本)")
    print("================================")
    print("系统已加载医学知识库，您可以开始提问。")
    print("输入 'exit' 退出系统。")
    print("输入 'upload' 上传文档。")
    print()
    
    while True:
        # Get user input
        query = input("您的问题: ")
        
        if query.lower() == 'exit':
            print("系统已退出。")
            break
        elif query.lower() == 'upload':
            # File upload functionality
            file_path = input("请输入文件路径: ")
            if os.path.exists(file_path):
                try:
                    rag_system.add_document(file_path)
                    print("文档上传成功！")
                except Exception as e:
                    print(f"上传失败: {str(e)}")
            else:
                print("文件不存在，请检查路径。")
        else:
            # Generate response
            response = rag_system.generate_response(query, user_id=user_id)
            
            # Print response
            print("\n系统回答:")
            print("-" * 50)
            print(response)
            print("-" * 50)
            print()

if __name__ == "__main__":
    main()
